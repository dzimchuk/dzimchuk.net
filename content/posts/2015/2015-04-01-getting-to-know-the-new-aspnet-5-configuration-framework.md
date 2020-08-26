---
title: Getting to know the new ASP.NET 5 configuration framework
date: 2015-04-01 18:50:00
permalink: getting-to-know-the-new-aspnet-5-configuration-framework
excerpt: .NET applications traditionally relied on `System.Configuration` components for accessing and managing configurations from the machine wide settings down to application and user settings. The new release of .NET revisits the configuration story by bringing on a brand new configuration framework...
uuid: 7e2f0537-161f-4d11-8b84-f087ebf7493e
tags: ASP.NET, .NET
---

.NET applications traditionally relied on `System.Configuration` components for accessing and managing configurations from the machine wide settings down to application and user settings. The components were designed to work with XML based configuration files. Although you can easily extend the files with custom sections you are bound to a standard way of doing configuration. This is a good thing and it works for most people. However, when you need to support non-standard configuration you have to come up with a custom solution.

The new release of .NET revisits the configuration story by bringing on a brand new [configuration framework](https://github.com/aspnet/Configuration) that removes dependency on the configuration file format while providing consistent abstraction that can be used throughout your applications. Out of the box you get support for commonly used formats such as XML, JSON or good old INI. It goes further and lets you read environment variables and command line arguments all through a single consistent interface.

The framework is designed to run on .NET Core, the new modularized cross-platform fork of the .NET framework as well as on traditional desktop .NET (4.5 and up). It is really lightweight. Have a look at the [source](https://github.com/aspnet/Configuration). Like [CoreFX](https://github.com/dotnet/corefx) it’s modular so if your component simply consumes configuration all you need is [ConfigurationModel.Interfaces](https://github.com/aspnet/Configuration/tree/dev/src/Microsoft.Framework.ConfigurationModel.Interfaces) package that contains a definition for `IConfiguration` interface. You would normally use dependency injection to provide an instance of it to your consuming components. This is a great step forward compared to a static class interface approach we got used to in `System.Configuration`.

Your bootstrapping component will need to initialize configuration and register it with your DI container. This is another key difference from `System.Configuration`. You explicitly specify what configuration you want to load.

```
public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        var configuration = new Configuration()
            .AddJsonFile("config.json")
            .AddEnvironmentVariables();

        app.UseServices(services => services.AddInstance(configuration));

        // ...
    }
}

```

Note that the new framework supports cascading settings where settings from sources defined later overwrite those from sources defined earlier. In the code sample above by putting `AddEnvironmentVariables()` after the default JSON-based configuration we allow environment settings to overwrite default ones that we supply with our application in a JSON file. This approach suites great for cloud based scenarios when we can adjust settings of a deployed application on the fly without changing files. For example, Azure Web Apps and Cloud Services allow us to do that from within the portal or from the command line.

As the code sample shown above relied on JSON-based and environment configuration it needs to only bring in [ConfigurationModel.Json](https://github.com/aspnet/Configuration/tree/dev/src/Microsoft.Framework.ConfigurationModel.Json) package (with its dependencies of course such as [ConfigurationModel](https://github.com/aspnet/Configuration/tree/dev/src/Microsoft.Framework.ConfigurationModel "Microsoft.Framework.ConfigurationModel")). As we are not interested in XML we don’t need to add extra dependency.

## It is not just web applications

The new configuration framework is not tied to ASP.NET although it leads its history from there. Let’s create a regular console application (it doesn’t have to be the new ASP.NET 5 console application, just a regular one that we all know and love) and add the following NuGet package to it:

```
<packages>
  <package id="Microsoft.Framework.ConfigurationModel" 
        version="1.0.0-beta3" targetFramework="net45" />
</packages>

```

The application will read the value of the %USERNAME% environment variable from `IConfiguration` and output in the console. It will also allow us to overwrite the value it outputs by providing it as a command line argument:

```
class Program
{
    static void Main(string[] args)
    {
        var configuration = new Configuration()
            .AddEnvironmentVariables()
            .AddCommandLine(args);

        Console.WriteLine("Hello {0}", configuration.Get("username"));
    }
}

```

Running the application without any arguments yields the following output:

```
c:\dev\ConsoleApplication1\bin\Debug>ConsoleApplication1.exe
Hello Andrei

```

Running it with an argument makes the configuration overwrite the setting value:

```
c:\dev\ConsoleApplication1\bin\Debug>ConsoleApplication1.exe /username TestUser
Hello TestUser

```

## It is extensible

Another great aspect of the new configuration framework that I would like to highlight is extensibility. If the sources that are provided out of the box are not enough you can always roll out your own one and add it to the configuration object. For example, you may need to get configuration from some proprietary binary file or a remote source like a database.

Some time ago I was describing an [implementation](/post/Implementing-External-Configuration-Store-Pattern-on-Azure) of the [External Configuration pattern](https://msdn.microsoft.com/en-us/library/dn589803.aspx) for cloud solutions and there was a class called `SettingsCache` that provided a static interface to settings that were read from a blob. With the new framework we can get rid of the static `SettingsCache` and provide external configuration through the consistent `IConfiguration` interface that can be injected in our components.

All it takes to support a custom configuration source is to create a class that would implement `IConfigurationSource` interface. The class will be responsible for loading, parsing and presenting configuration as key-value pairs. When initializing a Configuration object we can add our source to it or even better supply a convenient extension method for `IConfigurationSourceContainer` interface (that `Configuration` class implements) such as `AddExternalConfiguration`.

## There is more to it!

I highly recommend that you read up on more details of the new configuration framework in [this excellent article](http://blog.jsinh.in/asp-net-5-configuration-microsoft-framework-configurationmodel/#.VRxbcuGFdKo). The points that am really exited about is that it allows us to support literally any configuration source, it’s lightweight and cloud ready and we can use it in applications of any type that run on platforms that .NET Core supports.