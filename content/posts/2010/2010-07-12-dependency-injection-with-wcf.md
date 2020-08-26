---
title: Dependency injection with WCF
date: 2010-07-12 20:40:00
permalink: dependency-injection-with-wcf
uuid: bd99a820-37aa-4c2d-b469-b6b3ff88b57b
tags: Dependency Injection, WCF
---

Here's the goal:  
We want to have a WCF service that is decoupled from the repository implementation. We want the infrastructure to take care of setting up the service, injecting the repository implementation and triggering the disposure of the service and the repository object.

Suppose we have a simple service contract:

```
[ServiceContract(Namespace="http://www.dzimchuk.net/services/2010/07")]
public interface IService
{
    [OperationContract]
    void DoSomething();
}
```

Implementation of the service itself is up to you but here are the important bits concerning our primary point of interest:

```
[ServiceBehavior(InstanceContextMode =
    InstanceContextMode.PerCall, ConcurrencyMode=ConcurrencyMode.Multiple)]
public class Service : IService, IDisposable
{
    private IRepository _repository;

    public Service(IRepository repository)
    {
        _repository = repository;
    }

    ~Service()
    {
        Dispose(false);
    }

    private void Dispose(bool disposing)
    {
        if (disposing)
        {
            IDisposable disposable = _repository as IDisposable;
            if (disposable != null)
                disposable.Dispose();
        }
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    // implementation of IService is omitted
}
```

The service expects a repository object being set in the constructor. It is not coupled with a concrete implementation of the repository, it just expects it to comply with IRepository interface. The interface can be defined at the model layer or at the application layer.  
The implementaton of the repository belongs to the infrastructure layer or data access layer if you like. It is normally packaged in a separate assembly and makes use of any persistance mechanism you prefer.

Notice the implementation of the `IDisposable` interface in our service. We want to make sure to properly close the repository when the service instance is being disposed. Imagine your repository is a wrapper around a data access context like the Linq to Sql's `DataContext` or EF's `ObjectContext`. You want to make sure you dispose your context if you are a good citizen.

The idea is to keep an open repository object for the duration of the service instance existance. It will allow for transactional and session-like behavior if your service is designed to be used in a session. If you use stateless `PerCall` services the repository will be disposed as soon as we are done with the service. Which is almost always what you want.

This is not very well suitable for singleton services. It's not at all. You want to open up the repository at the begining of an operation and close it when exiting the operation (in the finally block of cource).

Once again, the shown above example fits `PerCall` and `PerSession` services only.

Ok, so we have deprived our service of the default constructor. Apparently we can't get away with it without instructing the service model how to instantiate our service. Moreover, we want to keep things decoupled so no `'new Repository()'` statements please!

To achieve our goal we need two ingredients:  
1\. A custom service instance provider that implements `System.ServiceModel.Dispatcher.IInstanceProvider`. The instance provider knows how to instantiate the service with a non-default constructor.  
2\. An IoC framework that will handle dependency injection, mainly instantiation of the configured repository to be passed to the service's constructor.

There are a number of IoC containers out there. I'm going to use [Castle Windsor](http://www.castleproject.org/container/index.html) in my samples but you are free to use any other. They are almost alike in terms of configuration and usage.

Before we go on and get our hands dirty let's consider where we want to package this stuff (that is the instance provider that uses an IoC container). We don't want to package it together with our service for the following reasons:  
1\. IoC configuration is perferred to be done via the configuration file. We want to have an ability for reconfiguraton without necessity to recompile code.  
2\. We don't really want to introduce a dependency on a particular IoC framework in our service assembly. Why? It has nothing to do with our service.

So we are going to leave our service alone and put the stuff somewhere else. Most likely in a hosting application. The hosting application is the joining point where we put everything together. It has a configuration file (web.config or app.config) that is used to configure the service model and is a perfect place to configure the IoC container. The hosting application will have to include our chosen IoC framework's assemblies so it will provide a corresponding instance provider.

Here is the configuration of the IoC container (as it applies to Castle Windsor):

```

<configSections>
  <section name="castle" 
type="Castle.Windsor.Configuration.AppDomain.CastleSectionHandler, Castle.Windsor"/>
</configSections>
<castle>
  <components>
    <component id="repository" 
              service="Some.Namespace.IRepository, ModelAssembly" 
              type="Data.EF.Repository, Data.EF" 
              lifestyle="Transient">
      <parameters>
        <connectionString>myConnectionString</connectionString>
      </parameters>
    </component>
    <component id="service" 
              service="Some.Other.Namespace.IService, ServiceAssemply" 
              type="Some.Other.Namespace.Service, ServiceAssemply" 
              lifestyle="Transient">
    </component>
  </components>
</castle>

```

There are 2 mappings:  
1\. `IRepository` is mapped to a concrete implementation.  
2\. `IService` is mapped to our concrete implementation of the service. This may seem reduntant but hold on, you will understand it in a moment.

That's enough for the Windsor to set up our stuff. Also note the connection string parameter we pass to the repository. This is a name of the connection string specified in the `<connectionStrings>` section. By passing it to the constructor of a repository we make it possible for the latter to get the connection string details via the standard ConfigurationManager.

Here is the implementation of the instance provider:

```
public class WindsorInstanceProvider : IInstanceProvider
{
    private WindsorContainer _container;
    private Type _contractType;

    public WindsorInstanceProvider(Type contractType)
    {
        _container = 
new WindsorContainer(new XmlInterpreter(new ConfigResource("castle")));
        _contractType = contractType;
    }

    #region IInstanceProvider Members

    public object GetInstance(InstanceContext instanceContext, 
                                        Message message)
    {
        return _container.Resolve(_contractType);
    }

    public object GetInstance(InstanceContext instanceContext)
    {
        return GetInstance(instanceContext, null);
    }

    public void ReleaseInstance(InstanceContext instanceContext, 
                                            object instance)
    {
        IDisposable disposable = instance as IDisposable;
        if (disposable != null)
            disposable.Dispose();
    }

    #endregion
}
```

The service model will call `GetInstance()` when a new instance is required and it will call `ReleaseInstance()` when the instance is no longer needed (the reference is passed to `ReleaseInstance`). If the service instance implements `IDisposable` the instance provider will make sure to call `Dispose()` on it.

The IoC container is configured in the constructor using Castle's built-in components to parse the configuration file. But wait! What's this `contractType`?  
This is actually our `IService` interface type. There are a number of way to register types with an IoC container, we could have used reflection to iterate through the service assembly and register concrete implementations instead of interfaces. But this approach is more suitable when concrete classes implement a well-known interface so we know upfron what we are looking for.

For WCF scenarios I found the approach to register service contracts with a container cleaner than registering service implementations. You specify the contract and the implementation in the configuration file. You have the ability to change the implementation without code recompilation (better decoupling) and your instance provider turns out to be quite generic.

Ok, how are we going to instruct the service model to use our instance provider? MSDN suggests implementing a custom endpoint or contract behavior that will inject the instance provider at the right time.  
You can look up the implementation of a contract behavior in MSDN. I'm going to show you how to do it with the endpoint behavior.

```
public class WindsorEndpointBehavior : 
                     BehaviorExtensionElement, IEndpointBehavior
{
    public override Type BehaviorType
    {
        get { return this.GetType(); }
    }

    protected override object CreateBehavior()
    {
        return this;
    }

    #region IEndpointBehavior Members

    public void AddBindingParameters(ServiceEndpoint endpoint,
                             BindingParameterCollection bindingParameters)
    {
    }

    public void ApplyClientBehavior(ServiceEndpoint endpoint, 
                                                ClientRuntime clientRuntime)
    {
    }

    public void ApplyDispatchBehavior(ServiceEndpoint endpoint,
                                         EndpointDispatcher endpointDispatcher)
    {
        endpointDispatcher.DispatchRuntime.InstanceProvider = 
          new WindsorInstanceProvider(endpoint.Contract.ContractType);
    }

    public void Validate(ServiceEndpoint endpoint)
    {
    }

    #endregion
}
```

All we need to do is create the instance provider in `ApplyDispatchBehavior` method and assign it to `endpointDispatcher.DispatchRuntime.InstanceProvider`. Notice that as we implement the endpoint behavior we are provided with the type of the service contract in `ApplyDispatchBehavior` method so we can pass it to our instance provider.

What's this `BehaviorExtensionElement`? This is a standard mechanism that allows you to use your custom behavior in a standard way via the configuration file:

```
<system.serviceModel>

  <extensions>
    <behaviorExtensions>
      <add name="windsor" 
type="WindsorEndpointBehavior, AssemblyContainingTheEndpointBehaviorExtension" />
    </behaviorExtensions>
  </extensions>

  <behaviors>
      <endpointBehaviors>
        <behavior>
          <windsor />
        </behavior>
      </endpointBehaviors>
  </behaviors>

  <!-- the rest of the service model configuration is omitted -->

</system.serviceModel>
```

As you can see I rely on WCF 4 default configuration feature, that is by omitting the name of the behavior I make sure it will be applied to all endpoints. You might want to use named bahaviors, in this case make sure you specify the name of the behavior in `behaviorConfiguration` attribute of the endpoints that should have a custom instance provider. It makes sense when you know you expose service contracts that don't require a repository.

That's it.