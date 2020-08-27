---
title: Setting up HTTPS endpoints in ASP.NET Core services in Service Fabric
date: 2017-01-26T15:25:00.000Z
lastmod: 2017-09-05T19:14:49.000Z
permalink: setting-up-https-endpoints-in-asp-net-core-services-in-service-fabric
excerpt: There are a few options for setting up HTTPS access for public facing ASP.NET Core services in Service Fabric. Your choice depends on the web server and whether or not you want to add a web gateway to your topology.
uuid: 803452e9-af34-4626-b96e-a5d241d84bfc
tags: Azure Service Fabric, ASP.NET
---

There are a few options for setting up HTTPS access for public facing ASP.NET Core services in Service Fabric. Your choice depends on the [web server](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/servers/) and whether or not you want to add a web gateway to your topology.

## Setting up HTTPS for WebListener

[WebListener](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/servers/weblistener) is Windows-only web server that is built on Http.Sys kernel mode driver. It can be used to expose your web apps and API endpoints directly to the Internet without requiring a reverse proxy as Http.Sys is a mature, robust, secure and tested technology.

First off, you need to make sure that the server certificate is installed on your nodes. You can do that manually on your dev box but you need to automate cert deployment to your cluster running in Azure. You do that be storing the cert in KeyVault and configuring your ARM template as explained [here](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-cluster-creation-via-arm).

You can use a self-signed certificate on your local machine and test clusters but you want to make sure to purchase a CA-signed one for your production clusters.

Then you need to configure Service Fabric to look up the certificate in the local store and set the SSL/TLS binding for your secure endpoints. In your application manifest you add a `Certificates` section:

```
<Certificates>
  <EndpointCertificate X509FindValue="[HttpsCertThumbprint]" Name="HttpsCert" />
</Certificates>
```

And add a binding policy for the secure endpoints defined in your services:

```
<ServiceManifestImport>
  <ServiceManifestRef ServiceManifestName="BookFast.WebPkg" ServiceManifestVersion="1.0.0" />
  <ConfigOverrides />
  <Policies>
    <EndpointBindingPolicy EndpointRef="ServiceEndpoint" CertificateRef="HttpsCert" />
  </Policies>
</ServiceManifestImport>
```

Service Fabric relies on [netsh http](https://technet.microsoft.com/en-us/library/cc725882(v=ws.10).aspx#BKMK_2) commands to configure HTTPS on a chosen IP and port and this configuration is used by Http.Sys.

`ServiceEndpoint` is the name of the secure endpoint that is configured in service manifest:

```
<Resources>
  <Endpoints>
    <Endpoint Protocol="https" Name="ServiceEndpoint" Type="Input" Port="443" />
  </Endpoints>
</Resources>
```

Notice the `HttpsCertThumbprint` parameter that was used to specify the cert to look up. Instead of hardcoding the thumbprint you want to take advantage of the [per-environment configuration](/configuring-asp-net-core-applications-in-service-fabric/) supported in Service Fabric.

Creating a WebListener-based listener is easy with `Microsoft.ServiceFabric.AspNetCore.WebListener` package:

```
protected override IEnumerable<ServiceInstanceListener> CreateServiceInstanceListeners()
{
    return new ServiceInstanceListener[]
    {
        new ServiceInstanceListener(serviceContext =>
            new WebListenerCommunicationListener(serviceContext, "ServiceEndpoint", url =>
            {
                ServiceEventSource.Current.ServiceMessage(serviceContext, $"Starting WebListener on {url}");

                return new WebHostBuilder().UseWebListener()
                            .ConfigureServices(
                                services => services
                                    .AddSingleton<StatelessServiceContext>(serviceContext))
                            .UseContentRoot(Directory.GetCurrentDirectory())
                            .UseStartup<Startup>()
                            .UseUrls(url)
                            .Build();
            }))
    };
}
```

In fact, the Visual Studio template for ASP.NET Core services uses WebListener by default.

## Setting up HTTPS for Kestrel

[Kestrel](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel) is a cross platform web server which is based on [libuv](https://github.com/libuv/libuv). It's new and it's highly recommended to put it behind a reverse proxy when exposing your apps running on it to the wild. Normally the proxy such as IIS or Nginx would handle HTTPS and communicate to Kestrel over plain HTTP.

In Service Fabric you probably want to go with the web gateway approach and make the gateway handle HTTPS. You want to check out [Azure Application Gateway](https://azure.microsoft.com/en-us/services/application-gateway/) which is basically a reverse proxy as a service solution. It provides application layer load-balancing, SSL offload, web firewall and health monitoring of the backend services.

If for whatever reason you still want to expose Kestrel over HTTPS here's how you do it.

Unlike the previous approach with WebListener where you relied on Service Fabric to set up a TLS binding for Http.Sys you need to provide the cert to Kestrel when configuring it. This frees you from having to store the cert in the local machine store on your nodes as you can retrieve it from anywhere (KeyVault, etc) at start-up.

Creating a Kestrel-based listener in Service Fabric is simplified with `Microsoft.ServiceFabric.AspNetCore.Kestrel` package and it's very similar to the code for the WebListener-based listener shown above. You can configure HTTPS by using the `UseKestrel()` override on `WebHostBuilder` that accepts `KestrelServerOptions` or you can do that when configuring services in your `Startup.cs`.

```
public void ConfigureServices(IServiceCollection services)
{
    X509Certificate2 cert = GetCertificate();
    services.Configure<KestrelServerOptions>(options =>
    {
        options.UseHttps(cert);
    });
}
```