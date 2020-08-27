---
title: Using code package environment variables in Service Fabric
date: 2017-01-19T15:07:41.000Z
lastmod: 2017-09-05T19:16:28.000Z
permalink: using-code-package-environment-variables-in-service-fabric
excerpt: In my previous post on configuring ASP.NET Core applications in Service Fabric I gave an example of how you could set a correct web host environment which allows you to adjust configuration and behavior of various components based on the current environment (staging, production, etc).
uuid: 1c790f3f-8588-483c-8db1-3ffcc0adf9cb
tags: Azure Service Fabric, ASP.NET
---

In my previous [post](/configuring-asp-net-core-applications-in-service-fabric/) on configuring ASP.NET Core applications in Service Fabric using configuration packages, per environment overrides and a custom configuration provider I gave an example of how you could set a correct [web host environment](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/environments) which allows you to adjust configuration and behavior of various components based on the current environment (staging, production, etc).

While everything from that post still stands there is a better way to set host environment as code packages also support environment variables which are set for the host process and which can be overwritten with per-environment values similar to configuration packages.

![Service Fabric configuration](https://blogcontent.azureedge.net/2017/01/Service-Fabric-configuration.png)

So if we consider the host environment example again the first thing that you need to do is to add `ASPNETCORE_ENVIRONMENT` in your service manifest:

```
<CodePackage Name="Code" Version="1.0.0">
    <EntryPoint>
      <ExeHost>
        <Program>BookFast.Facility.exe</Program>
        <WorkingFolder>CodePackage</WorkingFolder>
      </ExeHost>
    </EntryPoint>
    <EnvironmentVariables>
      <EnvironmentVariable Name="ASPNETCORE_ENVIRONMENT" Value="" />
    </EnvironmentVariables>
  </CodePackage>
```

Then make sure to override it in the application manifest:

```
<ServiceManifestImport>
  <ServiceManifestRef ServiceManifestName="BookFast.FacilityPkg" ServiceManifestVersion="1.0.0" />
  <ConfigOverrides>
    ...
  </ConfigOverrides>
  <EnvironmentOverrides CodePackageRef="Code">
    <EnvironmentVariable Name="ASPNETCORE_ENVIRONMENT" Value="[environment]" />
  </EnvironmentOverrides>
</ServiceManifestImport>
```

And finally define the `environment` parameter in the application manifest and provide its values in per-environment settings files.

You don't need to manually extract this setting from the configuration and provide it to `WebHostBuilder` anymore as it will be extracted from environment variables by the framework.

If you have more environment variables and you want to make them available through the standard configuration infrastructure just make sure you add the configuration provider from `Microsoft.Extensions.Configuration.EnvironmentVariables` package:

```
public Startup(StatelessServiceContext serviceContext)
{
    var builder = new ConfigurationBuilder()
        .AddServiceFabricConfiguration(serviceContext)
        .AddEnvironmentVariables();

    Configuration = builder.Build();
}
```

`AddServiceFabricConfiguration` is the extension that adds a custom configuration provider that reads from Service Fabric configuration packages as explained in the previous [post](/configuring-asp-net-core-applications-in-service-fabric/).