---
title: Adding SLAB out-of-process service to Azure cloud services
date: 2014-08-18 17:37:00
permalink: adding-slab-out-of-process-service-to-azure-cloud-services
excerpt: One great feature that Semantic Logging Application Block provides is an ability to use out-of-process service to listen to your messages. The idea is to move the logging sinks to another process so that messages don’t get lost if your application process crashes or it is terminated unexpectedly.
uuid: 2bee1142-9750-4cb4-a241-e8df7af5de86
tags: Cloud Patterns, Azure Cloud Services, Semantic Logging
---

One great feature that [Semantic Logging Application Block (SLAB)](http://msdn.microsoft.com/en-us/library/dn440729%28v=pandp.60%29.aspx) provides is an ability to use [out-of-process service](http://msdn.microsoft.com/en-us/library/dn440729%28v=pandp.60%29.aspx#sec17) to listen to your messages. The idea is to move the logging sinks to another process so that messages don’t get lost if your application process crashes or it is terminated unexpectedly.

We use SLAB out-of-process service in our cloud services that we build and run on Azure. The logging service is installed as a regular Windows service on VMs running our role instances and thus it survives roles’ recycling (do not confuse with complete VM recycling that can happen from time to time as well). In this post I would like to share some details about how you would add an out-of-process logging service to your cloud services.

The service itself is provided to you as a [nuget package](http://www.nuget.org/packages/EnterpriseLibrary.SemanticLogging). When you add it to your solution it gets installed as a solution level package, that is, no references or files are added to your projects. The package includes the service executable, configuration files and a PowerShell script. The script (install-packages.ps1) is there to fetch the service’ dependencies from the official nuget repository.

Here’s the first thing you need to decide. How do you include the service in your solution? One option, the most straightforward one, is to run the provided script and then copy all the files from ${packageLocation}\tools directory somewhere and insure they are being deployed together with your application. Another option is to update your build script to run the PowerShell script and then copy the fetched files. The latter approach is preferable as it will allow you to update the service package and let the build process take care of the rest.

If you chose to run the PowerShell script at build time you can do it either from the ‘pre build’ event:

```
<PreBuildEvent>powershell –NonInteractive –ExecutionPolicy 
  Unrestricted -File "$(SolutionDir)Automation\build-logging-service.ps1"
</PreBuildEvent>
```

Alternatively, you can run it as a ‘BeforeBuild’ target:

```
<Target Name="BeforeBuild">
  <Exec Command="powershell –NonInteractive –ExecutionPolicy 
    Unrestricted -File 
    &quot;$(SolutionDir)Automation\build-logging-service.ps1&quot;" />
</Target>

```

I’m mentioning an additional script ‘build-logging-service.ps1’ here to give you a hint that fetching the dependencies won’t be enough. In reality you will have to package the service somehow together with your application. I’ll get back to it later in this post.

> Whatever approach you choose, make sure you deploy the logging service in a separate directory. Do not copy its content into your application’s Bin directory as you don’t want to introduce conflicts between your application’s dependencies and the logging service’ dependencies.

Another thing to think about is configuration. SLAB out-of-process service reads configuration from an xml file (please refer to the [official documentation](http://msdn.microsoft.com/en-us/library/dn440729%28v=pandp.60%29.aspx#sec22)). In this file you configure your sinks and specify the event sources that are going to be consumed by those sinks. For example, if you use Azure Table Storage sink your configuration might look something like this:

```
<sinks>
  <windowsAzureTableSink name="SinkIdentifier" 
                         instanceName="YourRoleName" 
                         connectionString="UseDevelopmentStorage=true" 
                         tableAddress="Log"
                         bufferingIntervalInSeconds="1">
    <sources>
      <eventSource name="Microsoft-SemanticLogging" level="Warning" />
         <!-- buit-in non-transient fault tracing -->
      <eventSource name="custom-event-source" level="LogAlways" />
    </sources>
  </windowsAzureTableSink>
</sinks>

```

> Note that while you can specify the configuration file name in SemanticLogging-svc.exe.config file the settings will have to be put in the xml file anyway. In the real world you are going to support multiple deployment environments for your services so you should decide whether to include an xml file per environment and set the right one in the .config file at runtime or include a template xml file and set the correct values in it at runtime. Most often you will need to adjust the storage account credentials but keep the list of sinks and event sources intact so including a template xml file seems to be a better option.

As you can see some work will be required at runtime. Moreover, as I mentioned above, you need to be able to conveniently package the service and include it with your roles. One common approach is to pack external stuff (in our case the out-of-process service files) as an archive, included it in the project together with a startup script that would unpack it into a separate directory and execute it.

In your role projects you can add a folder called ‘Startup’ or ‘Extras’ that will include the logging service archive and the runtime startup script:

[![Startup folder of a cloud service role containing SLAB out-of-process service](https://blogcontent.azureedge.net/LoggingService_StartupFolder_thumb.png "Startup folder of a cloud service role containing SLAB out-of-process service")](https://blogcontent.azureedge.net/LoggingService_StartupFolder.png)

All included files are configured to ‘Copy always’ or ‘Copy if newer’ in the project’s settings. This way they will be included in the deployment package. Packing the logging service itself in a Zip archive makes perfect sense as you don’t have to worry about each individual file that the service consists of, you just want the whole package to get deployed. The ‘SemanticLogging-svc.xml’ file is the template configuration file that will get updated on startup.

Note that although LoggingService.zip must be included in the project it may not be checked into the source control if you chose to create it at build time.

Initialization PowerShell script cannot be invoked directly as an Azure role startup task however we can do it from a [regular batch file](http://msdn.microsoft.com/en-us/library/jj130675.aspx). The script will have to unpack the service into a separate folder (for example, ‘approot\LoggingService’), copy the configuration template file and update it as necessary and eventually run the service.

SLAB out-of-process service can be run in 2 modes: as a console application (pass ‘-c’ as a parameter) or as a WIndows service (pass ‘-s’ as a parameter). For example:

```
$mode = "-s"
if ($emulated)
{
    $mode = "-c"
}

Start-Process -FilePath SemanticLogging-svc.exe -ArgumentList "$mode"

```

When running in development environment you want it in the console mode so it shuts down when you shut down your role. In production you want it to run as a service.

> When you run it as a service it is safe to run it again when it’s already running (role recycling situation). The service is smart to detect this situation and the new instance will silently exit leaving the first one running.

You can pass in the $emulated flag when invoking the batch file as a startup task:

```
<Startup>
    <Task commandLine="Startup\init-logging-service.cmd" 
            executionContext="elevated" taskType="simple">
        <Environment>
             <Variable name="EMULATED">
                <RoleInstanceValue 
                    xpath="/RoleEnvironment/Deployment/@emulated" />
            </Variable>
        </Environment>
    </Task>
</Startup>

```

Make sure to run the task with elevated permissions as it needs to install a Windows service. You are likely to need to pass in more parameters like a storage account connection string.

Happy logging!