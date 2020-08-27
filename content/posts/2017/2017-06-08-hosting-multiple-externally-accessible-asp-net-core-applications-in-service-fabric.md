---
title: Hosting multiple externally accessible ASP.NET Core applications in Service Fabric
date: 2017-06-08T15:51:00.000Z
lastmod: 2017-09-06T04:36:18.000Z
permalink: hosting-multiple-externally-accessible-asp-net-core-applications-in-service-fabric
excerpt: This is a really quick post to answer a question that I was asked recently about how does one host multiple services or applications in Service Fabric so that they can be accessed from outside on the same port.
uuid: 62d81f6c-d487-43f9-86a9-f2acda5b6039
tags: Azure Service Fabric
---

This is a really quick post to answer a question that I was asked recently about how does one host multiple services or applications in Service Fabric so that they can be accessed from outside on the same port.

## WebListener

The most straight forward way is to use [WebListener](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/servers/weblistener) as your server that:

- can be directly exposed to the outside world as it's based on the mature Http.Sys driver;
- supports port sharing;
- can be easily [configured](/setting-up-https-endpoints-in-asp-net-core-services-in-service-fabric/) for HTTPS using service and application manifests.

You configure the WebListener in your services by adding `Microsoft.ServiceFabric.AspNetCore.WebListener` package and initializing a communication package like this:

```
protected override IEnumerable<ServiceInstanceListener> CreateServiceInstanceListeners()
{
    return new ServiceInstanceListener[]
    {
        new ServiceInstanceListener(serviceContext =>
            new WebListenerCommunicationListener(serviceContext, "ServiceEndpoint", (url, listener) =>
            {
                url = $"{url}/ServiceA";

                ServiceEventSource.Current.ServiceMessage(serviceContext, $"Starting WebListener on {url}");

                return new WebHostBuilder().UseWebListener()
                            .ConfigureServices(
                                services => services
                                    .AddSingleton<StatelessServiceContext>(serviceContext))
                            .UseContentRoot(Directory.GetCurrentDirectory())
                            .UseStartup<Startup>()
                            .UseApplicationInsights()
                            .UseServiceFabricIntegration(listener, ServiceFabricIntegrationOptions.None)
                            .UseUrls(url)
                            .Build();
            }))
    };
}
```

The key points here are:

- you use static ports configured in service manifests, e.g.
```
<Endpoints>
  <Endpoint Protocol="http" Name="ServiceEndpoint" Type="Input" Port="8080" />
</Endpoints>
```
- you use `ServiceFabricIntegrationOptions.None` option for the Service Fabric integration middleware which prevents it from adding a unique suffix to the URL that gets registered with the Naming service;
- you add your well known suffix to the URL that will be known externally, i.e. `url = $"{url}/ServiceA"`. You add a unique suffix for each service that you want to expose on the same port.

[Here](https://github.com/dzimchuk/service-fabric-expose-two-apps) you can find a sample solution implementing all of the above.

## Reverse proxy

Alternately, you may choose to expose your services through the [reverse proxy](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-reverseproxy). This way you can expose Kestrel or Node based services and you can set up HTTPS for the reverse proxy in the cluster ARM template as explained in the official documentation.

There are a couple of issues with this approach though:

1. The URL may not be what you want as it will need to include internal details such as application and service names, e.g. `http://mycluster.westeurope.cloudapp.azure.com/myapp/serviceA`.
2. By adding the reverse proxy to your node type you make all service running on nodes of that type accessible from outside. 

## Open your port to external callers

Whatever option you choose don't forget to set up a load balancing rule (and the corresponding probe rule) for your application port:

![Application port load balancing rule](https://blogcontent.azureedge.net/2017/06/LBRule.png)

If you use Network Security Groups (NSGs) in your cluster you will also need to add a rule to allow inbound traffic to your port.