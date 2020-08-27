---
title: Bring your own DI container to ASP.NET 5 - Unity
date: 2015-04-16T16:29:00.000Z
lastmod: 2015-04-22T17:35:05.000Z
permalink: bring-your-own-di-container-to-aspnet-5-unity
uuid: f0486eda-f4b4-414a-810e-fbb017c36e87
tags: ASP.NET, Dependency Injection
---

Now that we understand [some basics](http://dzimchuk.net/post/Bring-your-own-DI-container-to-ASPNET-5) of how dependency injection is handled by ASP.NET 5 we are ready to start rolling out our integration components for our container of choice. The process may not that straightforward at times and different containers have their quirks. I believe things will improve when new bits actually go GA and it's likely that containers will receive certain changes to play smooth with the abstraction. Microsoft has already provided sample implementations for some containers such as [Autofac](https://github.com/aspnet/DependencyInjection/tree/dev/src/Microsoft.Framework.DependencyInjection.Autofac) and [Ninject](https://github.com/aspnet/DependencyInjection/tree/dev/src/Microsoft.Framework.DependencyInjection.Ninject). Surprisingly there is no for [Unity](http://unity.codeplex.com/) yet. Autofac has already published alpha bit of there [own integration](http://alexmg.com/autofac-4-0-alpha-1-for-asp-net-5-0-beta-3/).

In this post I’m going to walk you through integrating Unity with ASP.NET pipeline. Sample implementation is just my first take on this and it has its rough edges. I think it was kind of a disclaimer. Note that it’s based on version 1.0.0-beta3 of related components.

Service provider implementation is pretty straightforward:

```
internal class UnityServiceProvider : IServiceProvider
{
    private readonly IUnityContainer container;

    public UnityServiceProvider(IUnityContainer container)
    {
        this.container = container;
    }

    public object GetService(Type serviceType)
    {
        return container.Resolve(serviceType);
    }
}

```

Note that we use a simple resolution by type without resolve overrides or named resolutions. This is sufficient for the infrastructure to resolve top level objects such as, for example, controllers. The rest of the tree will be handled by your container and you can use its advanced features.

## Scoping with Unity

To implement a lifetime scope in Unity you need two things: child containers and `HierarchicalLifetimeManager`. Child containers inherit registrations from the parent but they also allow you to specify different extensions. For us it's important that we can dispose a child container at the end of request processing when the service scope is disposed. When you register types with a container and specify `HierarchicalLifetimeManager` it makes the container track objects it creates. Thus, when we dispose the container it will dispose tracked objects (if they implement `IDisposable` of course).

Our service scope factory will look like this:

```
internal class UnityServiceScopeFactory : IServiceScopeFactory
{
    private readonly IUnityContainer container;

    public UnityServiceScopeFactory(IUnityContainer container)
    {
        this.container = container;
    }

    public IServiceScope CreateScope()
    {
        return new UnityServiceScope(CreateChildContainer());
    }

    private IUnityContainer CreateChildContainer()
    {
        var child = container.CreateChildContainer();
        child.AddExtension(new EnumerableResolutionExtension());
        return child;
    }
}

```

Service scope factory receives a top level container as a constructor parameter. It works because the factory itself is resolved from the top level service provider by [RequestServiceContainer](https://github.com/aspnet/Hosting/blob/1.0.0-beta3/src/Microsoft.AspNet.RequestContainer/RequestServicesContainer.cs). Notice the `EnumerableResolutionExtension` that I add to a child container. I will explain that shortly but first let's have a look at the service scope implementation:

```
internal class UnityServiceScope : IServiceScope
{
    private readonly IUnityContainer container;
    private readonly IServiceProvider provider;

    public UnityServiceScope(IUnityContainer container)
    {
        this.container = container;
        provider = container.Resolve<IServiceProvider>();
    }

    public IServiceProvider ServiceProvider
    {
        get { return provider; }
    }

    public void Dispose()
    {
        container.Dispose();
    }
}

```

Because it is given a child container the service provider it resolves out of it will encapsulate the very same child container instance. We could have created a service provider directly just as well.

## Resolving IEnumerable<T>

Unfortunately Unity can't automatically resolve `IEnumerable` of type when we register just the type. However, it natively supports resolution of an array of registered types. This is more of a design aspect of Unity. When we register multiple services of the same type with it we have to use named registrations otherwise services that are registered later will overwrite those registered earlier. We can register one and only one unnamed service of a particular type.

To consume all registered services of a type in a component we can make it accept an array of service types. This works out of the box but what if we can't change a component from requiring `IEnumerable<T>` to requiring an array of `T`? In this case we can rely on InjectionMember's, `ResolvedAll()` or adding a registration that would map `IEnumerable<T>` to `T[]` (`T` should be known at registration time).

This will work when it's our code and we know what types we are resolving. But we need to support resolution of `IEnumerable` of any type that's registered by ASP.NET and any framework that runs on it. We need to enable Unity to resolve `IEnumerable` as an array and it can be done with an extension. An example of such an extension can be found [here](https://github.com/NancyFx/Nancy.Bootstrappers.Unity/issues/7) and this is exactly what I'm using.

The downside of it is that it uses reflection methods like `IsGenericType` and `GetGenericArguments` that are not (yet) supported by .NET Core (I am using beta 3 at the time of writing). Like I said there are quirks and things are in flux now. We need to be aware of that.

## Registering service descriptors with Unity

In my previous post I was using `Populate` extension method to register service descriptors with Unity container. Now it is a good time to look into its implementation.

```
public static class UnityRegistration
{
    public static void Populate(this IUnityContainer container, 
        IEnumerable<IServiceDescriptor> descriptors)
    {
        container.AddExtension(new EnumerableResolutionExtension());

        container.RegisterType<IServiceProvider, UnityServiceProvider>();
        container.RegisterType<IServiceScopeFactory, UnityServiceScopeFactory>();

        foreach (var descriptor in descriptors)
        {
            Register(container, descriptor);
        }
    }

    private static void Register(IUnityContainer container, 
        IServiceDescriptor descriptor)
    {
        if (descriptor.ImplementationType != null)
        {
            container.RegisterType(descriptor.ServiceType, 
                descriptor.ImplementationType, 
                GetLifetimeManager(descriptor.Lifecycle));
        }
        else if (descriptor.ImplementationFactory != null)
        {
            container.RegisterType(descriptor.ServiceType, 
                GetLifetimeManager(descriptor.Lifecycle),
                new InjectionFactory(unity =>
                {
                    var provider = unity.Resolve<IServiceProvider>();
                    return descriptor.ImplementationFactory(provider);
                }));
        }
        else if (descriptor.ImplementationInstance != null)
        {
            container.RegisterInstance(descriptor.ServiceType, 
                descriptor.ImplementationInstance, 
                GetLifetimeManager(descriptor.Lifecycle));
        }
    }

    private static LifetimeManager GetLifetimeManager(LifecycleKind lifecycle)
    {
        switch (lifecycle)
        {
            case LifecycleKind.Singleton:
                return new ContainerControlledLifetimeManager();
            case LifecycleKind.Scoped:
                return new HierarchicalLifetimeManager();
            case LifecycleKind.Transient:
                return new TransientLifetimeManager();
            default:
                throw new NotSupportedException(lifecycle.ToString());
        }
    }
}

```

As with scoped child containers we need to add `EnumerableResolutionExtension` to the top level container. Note that we also register top level service provider and service scope factory. They are going to be used by the hosting [infrastructure](https://blogcontent.azureedge.net/ContainerMiddlewareSequence.png). The `Register` method needs to support all registration types (type, instance, factory) and life time modes (transient, singleton, scoped). In Unity object life time is controlled by the life time manager and we provide an appropriate instance of it with each registration.

## Show time

Here comes a major disappointment because I haven't managed to make it work with MVC yet. All services are registered successfully and requests are processed by the pipeline but they never hit a controller. It looks like routing is totally screwed up, both imperative as well as attribute based. I am going to research deeper into the issue and provide an update when I find something out. Also lately hosting and dependency injection packages have undergone refactoring so things might have changed.

Still I am going to test our Unity integration. I'll write up a poor man HTTP endpoint that will have some dependencies it will use to produce the response:

```
app.Run<IProductService, ILogger>(async (context, productService, logger) =>
{
    logger.WriteMessage("Handling request...");
    if (!context.Request.Path.StartsWithSegments(new PathString("/api/product")))
    {
        context.Response.StatusCode = 404;
        return;
    }

    var products = await productService.ListAsync();

    context.Response.ContentType = "application/json";
    await context.Response.WriteAsync(JsonConvert.SerializeObject(products));
});

```

We've got `IProductService` that we're going to use to get a list of products and `ILogger` service that we are going to use to output messages to console that will actually allow us to observe different life time modes:

```
internal class ConsoleLogger : ILogger, IDisposable
{
    private readonly string instanceId;

    public ConsoleLogger()
    {
        instanceId = Path.GetRandomFileName()
            .Replace(".", string.Empty);
    }

    public void WriteMessage(string message)
    {
        Console.WriteLine("{0} {1} - {2}", 
            DateTimeOffset.Now, instanceId, message);
    }

    public void Dispose()
    {
        Console.WriteLine("{0} {1} - ConsoleLogger::Dispose", 
            DateTimeOffset.Now, instanceId);
    }
}

```

Each instance of `ConsoleLogger` will get a unique ID and include it in the output. `ProductService` is defined below:

```
internal class ProductService : IProductService
{
    private readonly List<Product> products = new List<Product>
    {
        new Product { Id = 1, Name = "Product 1" },
        new Product { Id = 2, Name = "Product 2" }
    };

    private readonly ILogger logger;

    public ProductService(ILogger logger)
    {
        this.logger = logger;
    }

    public Task<IEnumerable<Product>> ListAsync()
    {
        logger.WriteMessage("ProductService::ListAsync");
        return Task.FromResult(products.AsEnumerable());
    }
}

```

`ProductService` also requires an instance of `ILogger`. This will allow us to verify scoped and singleton life time modes as we would expect the same instance of `ILogger` to be injected in `ProductService` as well as in the test middleware handler during processing of a single request. We would also expect the same instance to be used for different requests in singleton mode.

We are going to run the test application from the command line to be able to observe messages. Let's quickly add Microsoft.AspNet.Server.WebListener package and the following command to project.json:

```
"commands": {
    "web": "Microsoft.AspNet.Hosting 
            --server Microsoft.AspNet.Server.WebListener 
            --server.urls http://localhost:5000"
}

```

Let's start with transient services.

```
app.UseServices(services =>
{
    services.AddTransient<ILogger, ConsoleLogger>();
    services.AddTransient<IProductService, ProductService>();

    var container = new UnityContainer();
    container.Populate(services);

    return container.Resolve<IServiceProvider>();
});

```

```

4/16/2015 9:57:30 PM +03:00 hsi23r51whw - Handling request...
4/16/2015 9:57:30 PM +03:00 2rz5qgqzk4l - ProductService::ListAsync
4/16/2015 9:57:46 PM +03:00 gut0oadzqeu - Handling request...
4/16/2015 9:57:46 PM +03:00 aezxbucznes - ProductService::ListAsync

```

We issued two requests and as expected each time a new instance of the logger was provided to our components.

Let's do singleton now.

```
app.UseServices(services =>
{
    services.AddSingleton<ILogger, ConsoleLogger>();
    ...
    return container.Resolve<IServiceProvider>();
});

```

```

4/16/2015 10:04:15 PM +03:00 sn4yjruyzbh - Handling request...
4/16/2015 10:04:15 PM +03:00 sn4yjruyzbh - ProductService::ListAsync
4/16/2015 10:04:17 PM +03:00 sn4yjruyzbh - Handling request...
4/16/2015 10:04:17 PM +03:00 sn4yjruyzbh - ProductService::ListAsync

```

Same test but this time only a single instance of the logger was used for both requests.

Let's switch to scoped instance.

```
app.UseServices(services =>
{
    services.AddScoped<ILogger, ConsoleLogger>();
    ...
    return container.Resolve<IServiceProvider>();
});

```

```

4/16/2015 10:08:50 PM +03:00 uynnctk2l1y - Handling request...
4/16/2015 10:08:50 PM +03:00 uynnctk2l1y - ProductService::ListAsync
4/16/2015 10:08:50 PM +03:00 uynnctk2l1y - ConsoleLogger::Dispose
4/16/2015 10:08:51 PM +03:00 phpyxhpcvbi - Handling request...
4/16/2015 10:08:51 PM +03:00 phpyxhpcvbi - ProductService::ListAsync
4/16/2015 10:08:51 PM +03:00 phpyxhpcvbi - ConsoleLogger::Dispose

```

As expected each request was using their own single instance of the logger. Note that because we were using `HierarchicalLifetimeManager` this time scoped containers were tracking instances of the logger and disposed them at the end of their lifetime.