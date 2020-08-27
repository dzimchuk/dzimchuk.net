---
title: Configuring ASP.NET Core Data Protection in a distributed environment
date: 2018-07-20T15:32:52.000Z
lastmod: 2018-07-20T15:32:52.000Z
permalink: configuring-asp-net-core-data-protection-in-distributed-environment
excerpt: The ASP.NET Core data protection stack is designed to serve as the long-term replacement for the <machineKey> element in ASP.NET 1.x - 4.x. It's simple to configure and use, yet it provides powerful capabilities such as automatic algorithm selection, key lifetime management and protection at rest.
uuid: e9a88234-23ab-4326-ab36-eafdcc895ec1
tags: Azure Service Fabric, ASP.NET
---

The ASP.NET Core data protection stack is designed to serve as the long-term replacement for the `<machineKey>` element in ASP.NET 1.x - 4.x. It's simple to configure and use, yet it provides powerful capabilities such as automatic algorithm selection, encryption key lifetime management and key protection at rest.
    
When used in a distributed environment it requires a couple of simple configuration steps related to key storage and application isolation.

But why would you want to care? It is used by various ASP.NET Core and SingalR components as well as 3rd party ones. For example, in one project we chose [
AspNet.Security.OpenIdConnect.Server](https://github.com/aspnet-contrib/AspNet.Security.OpenIdConnect.Server) as a middleware for our identity service. The middleware uses Data Protection to protect refresh tokens. Our services are built with ASP.NET Core and deployed to Azure Service Fabric. At some point we've noticed that after we redeploy our application previously issued refresh tokens stop working and the client receives `invalid_grant` response from the middleware.

It took some time to figure out what was happening because we've already configured persistence of encryption keys in [external storage](https://docs.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-storage-providers#azure-and-redis) so there had to be something else that was changing during deployment that affected the Data Protection infrastructure.

The answer turned out to lie in the [per application isolation](https://docs.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview#per-application-isolation) feature. By default the physical path of the application is used as a unique application identifier. Upon redeployment to Service Fabric cluster the path changes (in the upgrade scenario it's likely due to service version change but we've also noticed this issue after full redeploy) and the service is unable to decrypt refresh tokens any more even though it uses the same key.

Here's the startup code that we now use in the service that hosts the authentication middleware:

```
var storageAccount = CloudStorageAccount.Parse(configuration["Configuration key to Azure storage connection string"]);
var client = storageAccount.CreateCloudBlobClient();
var container = client.GetContainerReference("key-container");

container.CreateIfNotExistsAsync().GetAwaiter().GetResult();

services.AddDataProtection()
    .SetApplicationName("Application Name")
    .PersistKeysToAzureBlobStorage(container, "keys.xml");
```

To summarize, in a distributed environment:

1. Make sure to persist encryption keys in external storage. Out of the box there are providers available for Azure storage and Redis. You can always plug in your own porvider.
2. Control the application name which is used by the app isolation mechanism by specifying it with a call to `SetApplicationName` method.