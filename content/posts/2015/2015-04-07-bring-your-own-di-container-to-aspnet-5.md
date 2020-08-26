---
title: Bring your own DI container to ASP.NET 5
date: 2015-04-07 17:05:00
permalink: bring-your-own-di-container-to-aspnet-5
uuid: 0141eccb-54f8-457e-9ebb-618964850e39
tags: ASP.NET, Dependency Injection
---

As you probably know ASP.NET 5 uses dependency injection from the ground up. It's unlike previous releases where higher level frameworks such as MVC, WebAPI or SignalR provided their own extension points to hook your DI container of choice in. In the new release dependency injection is going to be used throughout the stack from infrastructure and middleware to higher level frameworks to your custom components. And this is [awesome](https://www.youtube.com/watch?v=StTqXEQ2l-Y)!

Now to make things work the ASP.NET team provides a [default DI container](https://github.com/aspnet/DependencyInjection) so when you file new project and hit F5 the application runs and is set up with dependency injection and you didn't even do anything to make it happen. The default framework is capable of handling transient, singleton, instance and scoped dependencies which is a great start. However, chances are you may prefer a well known and established DI library for its advance capabilities or proven performance. ASP.NET recognizes that and allows you to replace the default container with your favorite one.

To avoid writing an excessively long post I'm going to focus on design aspects related to replacing the default container. In a subsequent post we are going to get our hands dirty by integrating [Unity](http://unity.codeplex.com/) with ASP.NET 5.

## Abstraction layer

A thin abstraction layer is necessary to make container substitution possible. ASP.NET infrastructure and various frameworks need a way to provide information about their service types and implementations and it has to be container agnostic. The infrastructure also needs a way to create a request scope in some generic manner without depending on how scoping is implemented by a particular container if implemented at all.

`ServiceDescriptor` is used to describe a service (pun intended). You can either map a service type to an implementation type, to a factory method or to an instance that you create up front. `ServiceDescriptor` also defines life cycle type (singleton, scoped or transient) of your service. When you register your services in the `Startup` class with extension methods like `AddTransient`, `AddScoped` and so on you effectively add service descriptions to a service collection (which is basically a list of service descriptions).

When you bring your own container you register all services that have been defined in the service collection with it. Then you register your own types with the container using its interface that is likely to provide much richer options like named registrations, custom parameter resolutions, etc.

A particular container instance that is used to resolve dependencies in a given scope is wrapped with a service provider that implements `System.IServiceProvider` interface. This is the first class that you need to write as it will encapsulate your container of choice.

The second class you write is an implementation of `IServiceScope`. The purpose of this class is to encapsulate a scoped container and create a service provider that wraps it. `IServiceScope` is derived from `IDisposable` so you will be able to dispose the scoped container which should effectively dispose all of the objects that have been resolved through it (given that the container is capable of tracking them).

Service scope is created by service scope factory which is responsible for creating a scoped container from the top level parent container and passing it to the service scope object when it creates it. Creating a scoped container is another container specific detail so you are going to need to write your factory by creating a class that implements `IServiceScopeFactory`.

## Pipeline

How are all of the components mentioned above used in the request processing pipeline? The answer is in [ContainerMiddleware](https://github.com/aspnet/Hosting/blob/1.0.0-beta3/src/Microsoft.AspNet.RequestContainer/ContainerMiddleware.cs) from [Microsoft.AspNet.RequestContainer](https://github.com/aspnet/Hosting/tree/1.0.0-beta3/src/Microsoft.AspNet.RequestContainer) package. For each request it will use a request provider encapsulating your top level container to create a service scope factory. It will then request a new scope from the factory and assign a service provider that it gets from it to the `RequestServices` property of `HttpContext`. Remember, this service provider wraps a scoped container.

[![ContainerMiddleware Sequence Diagram](https://blogcontent.azureedge.net/ContainerMiddlewareSequence_thumb.png "ContainerMiddleware Sequence Diagram")](https://blogcontent.azureedge.net/ContainerMiddlewareSequence.png)

When all subsequent middleware run and return the scope is disposed which disposes its scoped container and any objects it tracks. The above diagram is based on Beta 3\. As I am writing this post some level of refactoring has been done in the hosting infrastructure and the `ContainerMiddleware` has been moved to [Microsoft.AspNet.Hosting](https://github.com/aspnet/Hosting) package. Still the concepts and interactions are still valid.

## Top level service provider

As shown on the diagram we need to hand our own top level service provider to the infrastructure so it can use it to resolve its services from our replacement container as well as service scope factory. We do that by using an overload of `UseServices()` extension method that returns an implementation of `IServiceProvider`:

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.UseServices(services =>
        {
            services.AddMvc();

            var container = new UnityContainer();
            container.Populate(services);

            // register application services with Unity, i.e.
            container.RegisterType<IProductService, ProductService>();

            return container.Resolve<IServiceProvider>();
        });
    }
}

```

The `Populate` extension method is where we need to register all service descriptors that are already added to service collection. We can also register our application services through the service collection or we can use a native interface of the container.