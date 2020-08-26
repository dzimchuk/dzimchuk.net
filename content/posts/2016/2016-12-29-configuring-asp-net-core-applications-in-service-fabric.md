---
title: Configuring ASP.NET Core applications in Service Fabric
date: 2016-12-29 13:03:19
permalink: configuring-asp-net-core-applications-in-service-fabric
excerpt: ASP.NET Core provides a flexible configuration infrastructure that supports multiple configuration sources from flat files to environment variables to whatever you can imagine as it's easy to create a provider for a new source...
uuid: 2470112d-449b-4d54-bcf4-4a9439cf1735
tags: Azure Service Fabric
---

ASP.NET Core provides a flexible configuration infrastructure that supports multiple configuration sources from flat files to environment variables to whatever you can imagine as it's easy to create a provider for a new source. When you host your applications in Azure App Service you can't help but appreciate the convenience of using environment variables which allow you to keep per environment settings safe and away from source control. When working locally on a developer box you often rely on [User Secrets](https://docs.microsoft.com/en-us/aspnet/core/security/app-secrets) to keep settings used in development environments.

However, when you move your applications to Service Fabric you find out that the mentioned approaches don't quite work. Although [it's possible](https://github.com/Azure/service-fabric-issues/issues/3) to add environment variables to VMs that make up your cluster it's somewhat undesired as all variables are applied to all machines and we blur configuration boundaries of our services. And User Secrets are stored under your user account and are inaccessible to services running as NETWORK SERVICE.

**Update:** Service Fabric allows you to define environment variables for code packages. Read [this](/using-code-package-environment-variables-in-service-fabric/) post for more details.

## Service Fabric approach

Service Fabric promotes a different approach where each service can have an optional configuration package which is deployed with the service. The package contains a set of configuration settings required by this particular service and is versioned separately from other packages within the service. Finally, the configuration package can be independently updated.

[Per environment configuration](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-manage-multiple-environment-app-configuration) is achieved with configuration package overrides at the application level combined with the ability to provide per environment values for desired settings.

![Service packages and config overrides](https://blogcontent.azureedge.net/2016/12/Service-Fabric-Service-Packages.png)

To make it play nice with ASP.NET Core we just need to add a custom configuration provider to the configuration builder and make sure to set up a proper execution environment when building the host.

## ASP.NET Core configuration provider

Creating a configuration provider for ASP.NET Core that retrieves setting from the Service Fabric configuration infrastructure is quite simple. You don't have to implement multiple methods of the `IConfigurationProvider` interface. In fact, you can just inherit the `ConfigurationProvider` from `Microsoft.Extensions.Configuration` package which already implements most of the methods for you. The only things that's left is to actually read the settings and fill in the dictionary:

```
internal class ServiceFabricConfigurationProvider : ConfigurationProvider
{
    private readonly ServiceContext serviceContext;

    public ServiceFabricConfigurationProvider(ServiceContext serviceContext)
    {
        this.serviceContext = serviceContext;
    }

    public override void Load()
    {
        var config = serviceContext.CodePackageActivationContext.GetConfigurationPackageObject("Config");
        foreach (var section in config.Settings.Sections)
        {
            foreach (var parameter in section.Parameters)
            {
                Data[$"{section.Name}{ConfigurationPath.KeyDelimiter}{parameter.Name}"] = parameter.Value;
            }
        }
    }
}
```

You use a standard key delimiter which is a colon to separate section names from parameter names. Here's an example of the configuration package:

```
<?xml version="1.0" encoding="utf-8" ?>
<Settings xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.microsoft.com/2011/01/fabric">
  <!-- Add your custom configuration sections and parameters here -->
  
  <Section Name="Environment">
    <Parameter Name="ASPNETCORE_ENVIRONMENT" Value="" />
  </Section>

  <Section Name="Logging">
    <Parameter Name="IncludeScopes" Value="false" />
    <Parameter Name="LogLevel:Default" Value="Debug" />
    <Parameter Name="LogLevel:System" Value="Information" />
    <Parameter Name="LogLevel:Microsoft" Value="Information" />
  </Section>

  <Section Name="Data">
    <Parameter Name="DefaultConnection:ConnectionString" Value="" />
  </Section>

  <Section Name="ApplicationInsights">
    <Parameter Name="InstrumentationKey" Value="" />
  </Section>
  
</Settings>
```

This should remind you of `appsettings.json` as you find the same sections and because you can't have subsections here some parameter names are combined and separate with the standard delimiter. Pretty much the same way as you did with environment variables.

In order to add your provider to the configuration builder you also need to implement a configuration source which is as simple as this:

```
internal class ServiceFabricConfigurationSource : IConfigurationSource
{
    private readonly ServiceContext serviceContext;

    public ServiceFabricConfigurationSource(ServiceContext serviceContext)
    {
        this.serviceContext = serviceContext;
    }

    public IConfigurationProvider Build(IConfigurationBuilder builder)
    {
        return new ServiceFabricConfigurationProvider(serviceContext);
    }
}
```

And finally with a help of an extension method we build our configuration:

```
public static class ServiceFabricConfigurationExtensions
{
    public static IConfigurationBuilder AddServiceFabricConfiguration(this IConfigurationBuilder builder, ServiceContext serviceContext)
    {
        builder.Add(new ServiceFabricConfigurationSource(serviceContext));
        return builder;
    }
}

public class Startup
{
    public Startup(StatelessServiceContext serviceContext)
    {
        var builder = new ConfigurationBuilder()
            .AddServiceFabricConfiguration(serviceContext);

        Configuration = builder.Build();
    }

    private IConfigurationRoot Configuration { get; }
}
```

Just make sure to register your service context when building the host. By the way this is done for you when you use a standard Visual Studio template as shown below.

## ASP.NET Core environment

In ASP.NET Core you also have this concept of a [web host environment](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/environments) which is controlled by `ASPNETCORE_ENVIRONMENT` environment variable. It allows you to enable different services per environment or configure them differently. For instance, you enable developer mode in Application Insights only in development:

```
public Startup(IHostingEnvironment env, StatelessServiceContext serviceContext)
{
    ...

    if (env.IsDevelopment())
    {
        builder.AddApplicationInsightsSettings(developerMode: true);
    }

    ...
}
```

There is also a special tag helper that you can use in your views, for example, when referencing resources:

```
<environment names="Development">
    <link rel="stylesheet" href="~/lib/bootstrap/dist/css/bootstrap.css" />
    <link rel="stylesheet" href="~/css/site.css" />
</environment>
<environment names="Staging,Production">
    <link rel="stylesheet" href="https://ajax.aspnetcdn.com/ajax/bootstrap/3.3.6/css/bootstrap.min.css"
          asp-fallback-href="~/lib/bootstrap/dist/css/bootstrap.min.css"
          asp-fallback-test-class="sr-only" asp-fallback-test-property="position" asp-fallback-test-value="absolute" />
    <link rel="stylesheet" href="~/css/site.min.css" asp-append-version="true" />
</environment>
```

In Service Fabric you want to add this variable to your configuration package as shown in the package example above and override it when importing the service manifest in your application manifest:

```
<Parameters>
  ...
  <Parameter Name="ASPNETCORE_ENVIRONMENT" DefaultValue="" />
  ...
</Parameters>
<ServiceManifestImport>
  <ServiceManifestRef ServiceManifestName="BookFast.FacilityPkg" ServiceManifestVersion="1.0.0" />
  <ConfigOverrides>
    <ConfigOverride Name="Config">
      <Settings>
        <Section Name="Environment">
          <Parameter Name="ASPNETCORE_ENVIRONMENT" Value="[ASPNETCORE_ENVIRONMENT]" />
        </Section>
      </Settings>
    </ConfigOverride>
  </ConfigOverrides>
</ServiceManifestImport>
```

You provide the actual value for the `ASPNETCORE_ENVIRONMENT` in per environment parameter files that can be passed to `Publish-NewServiceFabricApplication` cmdlet. This is the approach that Visual Studio is taking as it relies on the scripts that get shipped with tooling. If you use `New-ServiceFabricApplication` cmdlet from the SDK (which is a recommended approach) you're going to need to read the parameter file and construct a hashtable that you can pass to the cmdlet. Here's how the tooling parses the parameters file:

```
function Get-ApplicationParametersFromApplicationParameterFile
{
    <#
    .SYNOPSIS 
    Reads ApplicationParameter xml file and returns HashTable containing ApplicationParameters.

    .PARAMETER ApplicationParameterFilePath
    Path to the application parameter file
    #>

    [CmdletBinding()]
    Param
    (
        [String]
        $ApplicationParameterFilePath
    )
    
    if (!(Test-Path $ApplicationParameterFilePath))
    {
        throw "$ApplicationParameterFilePath is not found."
    }
    
    $ParametersXml = ([xml] (Get-Content $ApplicationParameterFilePath)).Application.Parameters

    $hash = @{}
    $ParametersXml.ChildNodes | foreach {
       if ($_.LocalName -eq 'Parameter') {
       $hash[$_.Name] = $_.Value
       }
    }

    return $hash
}
```

Finally, specify the environment explicitly when building the web host:

```
protected override IEnumerable<ServiceInstanceListener> CreateServiceInstanceListeners()
{
    return new ServiceInstanceListener[]
    {
        new ServiceInstanceListener(serviceContext =>
            {
                var config = serviceContext.CodePackageActivationContext.GetConfigurationPackageObject("Config");
                var environment = config.Settings.Sections["Environment"].Parameters["ASPNETCORE_ENVIRONMENT"].Value;
                
                return new KestrelCommunicationListener(serviceContext, "ServiceEndpoint", url =>
                {
                    ServiceEventSource.Current.ServiceMessage(serviceContext, $"Starting Kestrel on {url}");

                    return new WebHostBuilder().UseKestrel()
                                .ConfigureServices(
                                    services => services
                                        .AddSingleton<StatelessServiceContext>(serviceContext))
                                .UseContentRoot(Directory.GetCurrentDirectory())
                                .UseStartup<Startup>()
                                .UseEnvironment(environment)
                                .UseUrls(url)
                                .Build();
                });
            })
    };
}
```

Notice the registration of the service context with the DI container. This is how you make it possible to inject it where you need it (for example, in your `Startup` class).

**Update:** There is a better way to set the host environment using code package environment variables. Read [this](/using-code-package-environment-variables-in-service-fabric/) post for more details.

## Consider Azure KeyVault

Instead of defining all of your settings including secrets in configuration packages you may choose to keep them in Azure KeyVault. There is also a [provider](https://github.com/aspnet/Configuration/tree/dev/src/Microsoft.Extensions.Configuration.AzureKeyVault) available for you out of the box. However, everything described in this post is still relevant because you need to authenticate with Azure AD first to access the KeyVault. Thus, you should still keep your client Id and client secret in per environment configuration. Or you can only keep the client Id only and set up your Azure AD app to use a [client certificate](https://docs.microsoft.com/en-us/azure/key-vault/key-vault-use-from-web-application#authenticate-with-a-certificate-instead-of-a-client-secret) instead of a secret. You will also need to deploy the cert to your cluster VMs and again specify the cert thumbprint in your settings to be able to look it up.