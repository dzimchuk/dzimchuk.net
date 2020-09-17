---
title: Re-iterating communication options in Service Fabric
date: 2017-05-31T15:38:15.000Z
lastmod: 2017-09-06T04:36:30.000Z
permalink: re-iterating-communication-options-in-service-fabric
excerpt: There are a few options you have to make your services talk to each other. In this post we're going to have a quick look at them and I'll give links to resources to learn more about each option. Note that we're going to look at direct communication between services.
uuid: 58c1b0df-489e-473e-ac0b-3a78667d8074
tags: Azure Service Fabric
---

There are a few options you have to make your services talk to each other. In this post we're going to have a quick look at them and I'll give links to resources to learn more about each option. Note that we're going to look at direct communication between services. Brokered communication is another integration option that has its pros and cons but there is nothing specific to Service Fabric.

## Naming service

The first option is to make your services resolve endpoints of others directly through the Naming service.

![Endpoint resolution through the Name service](https://blogcontent.azureedge.net/2017/02/SF-internal-communication.png)

Service Fabric SDK provides you with `ServicePartitionResolver` component that makes it easy to resolve a remote service endpoint by its canonical name, i.e. `fabric:/app/service`. It works both for stateless and stateful services and across applications as well. The SDK also provides `ServicePartitionClient` that implements caching of resoled endpoints and Retry pattern when you call them.

In [this](/implementing-a-rest-client-for-internal-communication-in-service-fabric/) post I've covered this option in detail and also gave an example of how to implement an [AutoRest](https://github.com/Azure/autorest) based client library that relies on `ServicePartitionClient`. It's also clear from that post that this option requires some added implementation effort on the client library side but in the end consumers will be able to build their proxies with dependency injection and configuration and they will get Retry for free.

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

## Reverse proxy

Another option is setting up the [reverse proxy](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-reverseproxy) in your node type(s). Once configured the proxy is running on all nodes in those node types where you chose to enable it. Your services simply issue calls to `localhost:[reverseProxyPort]` and let the proxy handle remote service endpoint resolution and calling of the remote service.

![Endpoint resolution with Reverse proxy](https://blogcontent.azureedge.net/2017/05/SF-reverse-proxy.png)

You specify application and service names together with partition keys in the URL when calling the reverse proxy:

```
http(s)://<Cluster FQDN | internal IP>:Port/<ServiceInstanceName>/<Suffix path>?PartitionKey=<key>&PartitionKind=<partitionkind>&ListenerName=<listenerName>&TargetReplicaSelector=<targetReplicaSelector>&Timeout=<timeout_in_seconds>
```

You enable the reverse proxy in selected or all node types by specifying a port that the proxy should listen on in node type definitions:

```
"nodeTypes": [
    {
        ...
        "reverseProxyEndpointPort": "[parameters('SFReverseProxyPort')]"
    }
]
```

On the local dev cluster (one box scenario) the proxy is already enabled and is available on port 19081 (see FabricHostSettings.xml):

```
<Section Name="FabricNode">
  ...
  <Parameter Name="HttpApplicationGatewayListenAddress" Value="19081" />
  <Parameter Name="HttpApplicationGatewayProtocol" Value="http" />
</Section>
```

You can also set up a load balancer rule to expose the port that the reverse proxy listens on to external callers. This enable such scenarios as:

- Exposing Kestrel or Node based services to the outside world.
- Exposing Kestrel or Node services over HTTPS (you will need to configure a certificate for the reverse proxy). SSL termination occurs at the reverse proxy. The proxy then uses HTTP to forward requests to your services. As of runtime 5.6 you can enable HTTPS [all the way](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-reverseproxy-configure-secure-communication) to your services.
- Exposing stateful services to the outside world. Stateful services can't be directly exposed as there is no way for the load balancer to know which nodes replicas of a particular partition are running on. You need to either provide a stateless façade as mentioned [here](/service-fabric-stateful-services/) or use the reverse proxy.

![Exposing service to the outside world using the reverse proxy](https://blogcontent.azureedge.net/2017/05/SF-reverse-proxy-external.png)

In [this](https://github.com/dzimchuk/book-fast-service-fabric/tree/ReverseProxy) version of BookFast I've implemented service client libraries and consuming proxies so that they can be used with the reverse proxy. Note that the client libraries are universal, i.e. they can be used both through the `ServicePartitionClient` or through the reverse proxy.

There are a couple of issues with consuming proxies though:

1. They now need to implement Retry (at the proxy-to-reverse-proxy part) themselves;
2. I had to make changes to AutoRest generated classes to support partition keys when calling stateful services. The problem is that partition keys are specified as query string parameters and currently AutoRest does not generate code that accepts optional query string parameters.

## DNS service

As of runtime 5.6 you can set up a [DNS service](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-dnsservice) in your cluster that enables endpoint resolution using the standard DNS protocol.

To be available using the DNS protocol your services need to be assigned their DNS names. For default services you can do that in the application manifest, e.g.:

```
<Service Name="FacilityService" ServiceDnsName="facility.bookfast">
  <StatelessService ServiceTypeName="FacilityServiceType" InstanceCount="[FacilityService:ServiceFabric:InstanceCount]">
    <SingletonPartition />
  </StatelessService>
</Service>
```

For non-default services you can specify their DNS name as a new `-ServiceDnsName` parameter to `New-ServiceFabricService` cmdlet.

Consuming services will then use the DNS name in the URL when calling other services. The DNS service provides mapping between DNS names and canonical service names. Once the canonical name is determined the DNS service resolves the actual endpoint address through the Naming service and returns the address to the caller.

![Endpoint resolution using Service Fabric DNS service](https://blogcontent.azureedge.net/2017/05/SF-DNS-service.png)

It's a pretty straight forward way to call stateless services and will also be useful especially in 'lift and shift' scenarios. It won't work with stateful services though as you need to be able to resolve a particular partition and replica to communicate with.