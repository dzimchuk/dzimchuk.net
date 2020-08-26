---
title: Implementing a REST client for internal communication in Service Fabric
date: 2017-02-23 15:41:00
permalink: implementing-a-rest-client-for-internal-communication-in-service-fabric
excerpt: In this post we're going to look at specifics of building a REST client for service to service communication within a Service Fabric cluster. We're going to discuss endpoint resolution and communication components and how we can use them with AutoRest generated clients and ADAL.
uuid: 16143e4e-56c8-4d88-b60f-1af40fe69c0a
tags: Azure Service Fabric
---

In this post we're going to look at specifics of building a REST client for service to service communication within a Service Fabric cluster. We're going to discuss endpoint resolution and communication components provided by Service Fabric and how we can use them with AutoRest generated clients and ADAL.

## Internal communication basics

Service Fabric cluster manager takes care of spreading service instances and replicas across cluster nodes and relocating them as needed. From the internal communication standpoint the most important thing to remember is that a service endpoint is not permanent and may change at any moment. Your service may get shut down when it's unresponsive or the node it's running on is getting updated. The service may get moved to another node for more efficient utilization of the cluster resources as determined by Service Fabric.

Every time you register a listener you return the actual endpoint address from `ICommunicationListener.OpenAsync` method that gets registered with the naming service running in the cluster. For a consuming service to call your service it requires the following steps to be carried out:

1. Call the naming service with a canonical Uri of the target service in order to get an actual address that can be used to make a call.
2. Try to call the service using the returned address.
3. Handle possible errors and decide whether we need to repeat steps 1-3 as the target service may have been moved to another node by the time we tried to reach it. Also, implementing Retry and Circuit Breaker patterns are going to help mitigate transient errors and avoid bombarding services that are experiencing issues.

![Internal communication in Service Fabric](https://blogcontent.azureedge.net/2017/02/SF-internal-communication.png)

Service Fabric provides components that help you communicate with the naming service. First of all, it's `FabricClient` which is central component for communication with Service Fabric infrastructure. It implements internal optimizations such as caching and it's highly recommended to share and re-use a `FabricClient` instance within your service.

Another component is `ServicePartitionResolver` that relies on `FabricClient` and can be used to obtain an actual endpoint address given a canonical service Uri within a partition.

Endpoint resolution procedure can be sketched like this:

```
ServicePartitionResolver resolver = ServicePartitionResolver.GetDefault();
ResolvedServicePartition partition = 
    await resolver.ResolveAsync("fabric:/BookFast/FacilityService", new ServicePartitionKey(), cancellationToken);
    
ResolvedServiceEndpoint endpoint = partition.GetEndpoint();
                
JObject addresses = JObject.Parse(endpoint.Address);
string address = (string)addresses["Endpoints"].First();
```

Here we use a singleton instance of `ServicePartitionResolver` that takes care of instantiating `FabricClient`. We try to resolve a current address of BookFast facility service by its canonical Uri `fabric:/BookFast/FacilityService` using a singleton partition. Normally, you don't partition stateless services and this is exactly the case with the facility service.

`partition.GetEndpoint()` is going to return an address of a random instance of your stateless service. Then all that's left is some parsing trivia.

Unlike stateless services, stateful services often require partitioning as this is the way they scale out. So if you're communicating with a stateful service you need to provide a valid partition key (based on the agreed partitioning schema) and expect `partition.GetEndpoint()` to return an endpoint of the primary replica which is the replica you want to communicate to as it has read and write access to the service state.

## Getting retry support with ServicePartitionClient

Service Fabric also provides you with a higher level communication component called `ServicePartitionClient` which handles endpoint resolution under the hood and gives you two things on top of that:

1. It caches resolved endpoints which improves efficiency as you don't have to call the naming service every time you want to call a service which endpoint has already been resolved. `ServicePartitionClient` will re-trigger endpoint resolution if the endpoint turns out to be stale.
2. It implements the Retry pattern which is a recommended practice to mitigate self healing (aka transient) errors.

There are a few more classes involved when working with `ServicePartitionClient`. First of all, it's communication client factory that performs most of the work by communicating with the naming service using `ServicePartitionResolver` and caching resolved endpoints. As the cache is maintained within an instance of the factory you want to re-use it between your calls to other services. That means, you normally want to go with a singleton instance of the factory.

Now, it's called a factory because its purpose is to create instances of communication clients. Think of a communication client as a wrapper around a resolved endpoint that implements `ICommunicationClient` interface. In your consuming services you create factories by deriving from `CommunicationClientFactoryBase` and implementing its methods such as `CreateClientAsync`.

Finally, you need a way to tell `ServicePartitionClient` how to handle errors and whether it should retry a call or resolve a new endpoint address. You do that by implementing `IExceptionHandler`. Service Fabric samples give an example of a [possible implementation](https://github.com/Azure-Samples/service-fabric-dotnet-getting-started/blob/master/Services/WordCount/WordCount.WebService/HttpExceptionHandler.cs) of the interface. In fact, you want to check out this particular WordCount sample to get an idea of how all these components fit together.

## Common infrastructure classes and AutoRest

I've already [blogged](https://dzimchuk.net/generating-clients-for-your-apis-with-autorest/) about using AutoRest to generate clients against Swagger documentation provided by RESTful services. I recommend this approach (or any alternative such as [swagger-codegen](https://github.com/swagger-api/swagger-codegen)) as it removes grinding chore of writing ceremony code around `HttpClient`.

AutoRest generates representations (models), the actual wrapper around `HttpClient` and the interface that this wrapper implements. Now, to be realistic, you normally build additional proxy components on top of this generated code as you have to at least handle HTTP error responses and perform additional mapping.

Here's what your proxy might look like:

```
internal class FacilityProxy : IFacilityProxy
{
    private readonly IFacilityMapper mapper;
    private readonly IBookFastFacilityAPI api;

    public FacilityProxy(IFacilityMapper mapper,
        IBookFastFacilityAPI api)
    {
        this.mapper = mapper;
        this.api = api;
    }
    
    public async Task<Contracts.Models.Facility> FindAsync(Guid facilityId)
    {
        var result = await api.FindFacilityWithHttpMessagesAsync(facilityId);

        if (result.Response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FacilityNotFoundException(facilityId);
        }

        return mapper.MapFrom(result.Body);
    }
}
```

`IBookFastFacilityAPI` is the generated interface and the rest is our usual proxy code. We would like to use the proxy in Service Fabric and take advantage of its communication components described above.

First, let's create a communication client that represents a resolved endpoint:

```
public class CommunicationClient<T> : ICommunicationClient
{
    private readonly Func<Task<T>> apiFactory;

    public CommunicationClient(Func<Task<T>> apiFactory)
    {
        this.apiFactory = apiFactory;
    }

    public Task<T> CreateApiClient() => apiFactory();

    ResolvedServiceEndpoint ICommunicationClient.Endpoint { get; set; }
    string ICommunicationClient.ListenerName { get; set; }
    ResolvedServicePartition ICommunicationClient.ResolvedServicePartition { get; set; }
}
```

We're not that interested in `ICommunicationClient` interface itself. Rather we want to get a hold of the factory method that creates an instance of the AutoRest generated client. `T` represents a particular client type, such as `IBookFastFacilityAPI`.

You may wonder why we need this factory method but hold on a minute, I'll get back to it soon.

Let's also define a factory interface to be used in our proxy to create a `ServicePartitionClient`:

```
public interface IPartitionClientFactory<TCommunicationClient> where TCommunicationClient : ICommunicationClient
{
    ServicePartitionClient<TCommunicationClient> CreatePartitionClient();
    ServicePartitionClient<TCommunicationClient> CreatePartitionClient(ServicePartitionKey partitionKey);
}
```

The second overload accepting `ServicePartitionKey` is useful for stateful services.

Now our proxy code can be rewritten like this:

```
internal class FacilityProxy : IFacilityService
{
    private readonly IFacilityMapper mapper;
    private readonly IPartitionClientFactory<CommunicationClient<IBookFastFacilityAPI>> factory;

    public FacilityProxy(IFacilityMapper mapper,
        IPartitionClientFactory<CommunicationClient<IBookFastFacilityAPI>> factory)
    {
        this.mapper = mapper;
        this.factory = factory;
    }

    public async Task<Contracts.Models.Facility> FindAsync(Guid facilityId)
    {
        var result = await factory.CreatePartitionClient()
            .InvokeWithRetryAsync(async client =>
            {
                var api = await client.CreateApiClient();
                return await api.FindFacilityWithHttpMessagesAsync(facilityId);
            });

        if (result.Response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FacilityNotFoundException(facilityId);
        }

        return mapper.MapFrom(result.Body);
    }
}
```

Now we have endpoint resolution, caching and retry and we still use the AutoRest generated client. Sweet!

## Implementing a service client

Often teams responsible for particular services provide client libraries for consumers of their services. Let's see how such a library can be implemented for the facility service.

The library apparently will incorporate the AutoRest generated code together with the implementation of `IPartitionClientFactory` and required components.

The central component is the communication client factory:

```
internal class FacilityCommunicationClientFactory : 
    CommunicationClientFactoryBase<CommunicationClient<IBookFastFacilityAPI>>
{
    public FacilityCommunicationClientFactory(IServicePartitionResolver resolver)
        : base(resolver, new[] { new HttpExceptionHandler() })
    {
    }

    protected override Task<CommunicationClient<IBookFastFacilityAPI>> CreateClientAsync(string endpoint, CancellationToken cancellationToken)
    {
        var client = new CommunicationClient<IBookFastFacilityAPI>(
            () => Task.FromResult<IBookFastFacilityAPI>(new BookFastFacilityAPI(new Uri(endpoint))));

        return Task.FromResult(client);
    }
}
```

I omitted other methods' implementations as they are trivial for HTTP clients.

Now it's time to explain this delegate dance when instantiating `BookFastFacilityAPI`. I was migrating the facility service from a stand alone public facing service which required an access token issued by Azure AD. I did not want to change internals of the service which rely on the token so I had to have an opportunity to execute code before each call to the service. You got it, in this case this code is about getting or refreshing the access token. Here's the updated implementation of the factory:

```
internal class FacilityCommunicationClientFactory : 
    CommunicationClientFactoryBase<CommunicationClient<IBookFastFacilityAPI>>
{
    private readonly IAccessTokenProvider accessTokenProvider;
    private readonly ApiOptions apiOptions;

    public FacilityCommunicationClientFactory(IServicePartitionResolver resolver, 
        IAccessTokenProvider accessTokenProvider, 
        IOptions<ApiOptions> apiOptions)
        : base(resolver, new[] { new HttpExceptionHandler() })
    {
        if (accessTokenProvider == null)
        {
            throw new ArgumentNullException(nameof(accessTokenProvider));
        }

        this.accessTokenProvider = accessTokenProvider;
        this.apiOptions = apiOptions.Value;
    }

    protected override Task<CommunicationClient<IBookFastFacilityAPI>> CreateClientAsync(string endpoint, CancellationToken cancellationToken)
    {
        var client = new CommunicationClient<IBookFastFacilityAPI>(async () =>
        {
            var accessToken = await accessTokenProvider.AcquireTokenAsync(apiOptions.ServiceApiResource);
            var credentials = string.IsNullOrEmpty(accessToken) 
                              ? (ServiceClientCredentials)new EmptyCredentials()
                              : new TokenCredentials(accessToken);

            return new BookFastFacilityAPI(new Uri(endpoint), credentials);
        });

        return Task.FromResult(client);
    }
}
```

Remember that communication clients get cached and we want to make sure to check and refresh access tokens if they happen to get stale. I rely on ADAL with its internal token cache and refresh logic to handle tokens. I've recently [blogged](https://dzimchuk.net/adal-distributed-token-cache-in-asp-net-core/) about ADAL's cache and the possible implementation of the access token provider.

> We are talking about internal communication and you may have a valid question why we need tokens when communicating to internal services. Often you need to create a security context for the call and I agree that with internal services going full OAuth2 is an overkill. Even if an internal service is also exposed to the outside world we may choose to implement separate endpoints for internal and external communication. But in this case it was a migration of a stand alone service which already relied on JWT tokens to construct a security context. It's a viable approach when you're not ready to change the internals of the service.

The implementation of `IPartitionClientFactory` is straight forward:

```
internal class FacilityPartitionClientFactory : 
    IPartitionClientFactory<CommunicationClient<IBookFastFacilityAPI>>
{
    private readonly ICommunicationClientFactory<CommunicationClient<IBookFastFacilityAPI>> factory;
    private readonly ApiOptions apiOptions;

    public FacilityPartitionClientFactory(ICommunicationClientFactory<CommunicationClient<IBookFastFacilityAPI>> factory, 
        IOptions<ApiOptions> apiOptions)
    {
        this.factory = factory;
        this.apiOptions = apiOptions.Value;
    }

    public ServicePartitionClient<CommunicationClient<IBookFastFacilityAPI>> CreatePartitionClient() => 
        new ServicePartitionClient<CommunicationClient<IBookFastFacilityAPI>>(factory, new Uri(apiOptions.ServiceUri));

    public ServicePartitionClient<CommunicationClient<IBookFastFacilityAPI>> CreatePartitionClient(ServicePartitionKey partitionKey) => 
        new ServicePartitionClient<CommunicationClient<IBookFastFacilityAPI>>(factory, new Uri(apiOptions.ServiceUri), partitionKey);
}
```

We expect the canonical address of the facility service to be specified in the consuming service configuration. We also need to implement registration of our components in the DI container of the consuming service:

```
public class CompositionModule : ICompositionModule
{
    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ApiOptions>(configuration.GetSection("FacilityApi"));

        services.AddSingleton(new FabricClient());

        services.AddSingleton<ICommunicationClientFactory<CommunicationClient<IBookFastFacilityAPI>>>(
            serviceProvider => new FacilityCommunicationClientFactory(
                new ServicePartitionResolver(() => serviceProvider.GetService<FabricClient>()),
                serviceProvider.GetService<IAccessTokenProvider>(),
                serviceProvider.GetService<IOptions<ApiOptions>>()));

        services.AddSingleton<IPartitionClientFactory<CommunicationClient<IBookFastFacilityAPI>>, FacilityPartitionClientFactory>();
    }
}
```

We want to go with a single instance of the communication client factory to take advantage of its cache.

