---
title: Be aware of Web role host process
date: 2015-02-21T09:10:00.000Z
lastmod: 2017-09-09T11:03:19.000Z
permalink: be-aware-of-web-role-host-process
excerpt: Azure cloud service web roles have one peculiarity in regard to the way your code is hosted. The thing is although you have a single project associated with your web role it will actually be run in two separate processes.
uuid: a9a058e9-3821-4ff1-9982-46f6b1d1786d
tags: Azure Cloud Services
---

Azure cloud service web roles have one peculiarity in regard to the way your code is hosted. The thing is although you have a single project associated with your web role it will actually be run in two separate processes. One process is WaIISHost.exe and it will run your `RoleEntryPoint` and this is where you can handle `OnStart`, `OnStop` and `Run` events. An instance of your role is running as long as this process is running.

The second process actually hosts your web application. If you’re running on IIS it will be a worker process for your application pool (w3wp.exe). If you’re running your service locally in your development environment chances are you are using IIS Express (iisexpress.exe).

So what is the issue here? Well, things can go wrong if you misplace your initialization logic and/or configuration. It can be observed as a misbehavior or even a crash. Let me demonstrate a few examples of what can happen.

> Issues that I’m going to describe in this post are relevant to web roles only. Worker roles are hosted by a single process (WaWorkerHost.exe).

## Set up test harness

Before we start let’s create a simple cloud service containing a single web role. In Visual Studio select Azure Cloud Service template in the ‘New Project’ dialog, then add a single web role. On the next page you will be presented with a standard one ASP.NET dialog where you can preselect components you need in your application. We’re going to select ‘Empty project’ as we want to focus on hosting.

Now that we have a bare bones application let’s add some code so it gives us output. Add the following NuGet package to the web project:

Microsoft.Owin.Host.SystemWeb

It’s going to bring down a few other packages with it. Now we have created an OWIN-based web application that’s going to be hosted in IIS. Let’s add an OWIN start-up class and add the following code to it:

```
public class Startup
{
    public void Configuration(IAppBuilder app)
    {
        app.Run(async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("Hello World!");
        });
    }
}

```

Awesome! Now we’ve got a harness set up. Hit F5 to verify everything works.

## Your code is living in two processes

Let’s add a setting to our role. Right-click on your role, select Properties and add a TestSetting on the Settings page:

[![Adding a TestSetting](https://blogcontent.azureedge.net/image_thumb.png "Adding a TestSetting")](https://blogcontent.azureedge.net/image.png)

Not let’s add a simple component that we will initialize with our TestSetting:

```
public class SettingsCache
{
    private static readonly Lazy<SettingsCache> instance = 
        new Lazy<SettingsCache>();

    public static SettingsCache Insance
    {
        get { return instance.Value; }
    }

    private readonly ConcurrentDictionary<string, string> cache = 
        new ConcurrentDictionary<string, string>();

    public string Find(string key)
    {
        string value;
        return cache.TryGetValue(key, out value) ? value : null;
    }

    public void Update(string key, string value)
    {
        cache.AddOrUpdate(key, value, (k, v) => value);
    }
}

```

I want to keep it really simple for demonstration purposes. Let’s add some initialization code to our `RoleEntryPoint.OnStart` event:

```
public class WebRole : RoleEntryPoint
{
    public override bool OnStart()
    {
        var value = CloudConfigurationManager
            .GetSetting("TestSetting");
        SettingsCache.Insance.Update("TestSetting", value);

        return base.OnStart();
    }
}

```

And finally let’s update our request handler to make use of the test component:

```
app.Run(async context =>
{
    context.Response.ContentType = "text/plain";
    await context.Response.WriteAsync(
        string.Format("Value: {0}", SettingsCache.Insance
                                    .Find("TestSetting")));
});

```

If we run our application we are going to see the following:

[![No value has been set](https://blogcontent.azureedge.net/image_thumb_1.png "No value has been set")](https://blogcontent.azureedge.net/image_1.png)

It may seem naïve to you but trust me it happens. We have just misplaced our initialization code and we run it in another process than the one that actually needs it. Let’s move the initialization to our OWIN start-up class:

```
public class Startup
{
    public void Configuration(IAppBuilder app)
    {
        InitializeSettingsCache();

        app.Run(async context =>
        {
            ...
        });
    }

    private static void InitializeSettingsCache()
    {
        var value = CloudConfigurationManager
            .GetSetting("TestSetting");
        SettingsCache.Insance.Update("TestSetting", value);
    }
}

```

Now it runs as expected:

[![Value has been set](https://blogcontent.azureedge.net/image_thumb_2.png "Value has been set")](https://blogcontent.azureedge.net/image_2.png)

## But you need to take care of RoleEntryPoint configuration too

Alright, you may think it’s clear. We just need to make sure we set things up in places that belong to the actual web application (Global.asax, OWIN start-up, etc) and we should be fine. In most cases yes but let’s have a look at another example. This one is going to make our role crash and recycle.

Let’s add an Azure storage client library to our project. You are very likely to work with Azure storage in your cloud solutions so go and add the following package:

WindowsAzure.Storage

Now any decent software should implement efficient logging and tracing to collect diagnostic information. [Semantic logging application block (SLAB)](https://msdn.microsoft.com/en-us/library/dn440729%28v=pandp.60%29.aspx) has proven to be quite efficient for cloud solutions. It supports logging to Azure Table Storage, Amazon S3, out-of-process logging service and more. Let’s add it to our solution by installing the following NuGet package:

EnterpriseLibrary.SemanticLogging.WindowsAzure

SLAB requires you to write event sources for your strongly typed events. Let’s quickly sketch an event source for ourselves:

```
[EventSource(Name = "test-event-source")]
public class TestEventSource : EventSource
{
    private static readonly Lazy<TestEventSource> Instance = 
        new Lazy<TestEventSource>();

    public static TestEventSource Log
    {
        get { return Instance.Value; }
    }

    [Event(1, 
           Message = "RoleEntryPoint::Start", 
           Level = EventLevel.Informational)]
    public void LogRoleStart(string processName)
    {
        if (IsEnabled())
            WriteEvent(1, processName);
    }

    [Event(2, 
           Message = "Owin::Startup", 
           Level = EventLevel.Informational)]
    public void LogOwinStart(string processName)
    {
        if (IsEnabled())
            WriteEvent(2, processName);
    }
}

```

Good, now we need to set up a sink. We can use [out-of-process server](post/Adding-SLAB-out-of-process-service-to-Azure-cloud-services) that will capture events coming from ETW (Event Tracing for Windows) infrastructure but you may also choose in-process sinks. This is exactly what we’re going do now. Remember, we have two processes hosting our app and if we want to use logging in both of them we need to set up sinks in each process.

```
private static void InitializeLogging()
{
    var listener = new ObservableEventListener();
    listener.EnableEvents(TestEventSource.Log, 
        System.Diagnostics.Tracing.EventLevel.Informational);
    listener.LogToWindowsAzureTable("TestWebRole", 
        CloudConfigurationManager
            .GetSetting("Diagnostics.ConnectionString"));
}

```

Add and call this method to both `RoleEntryPoint` as well as to the OWIN start-up class. Change instance name from ‘TestWebRole’ to for example ‘WebApp’ when putting it in the OWIN start-up class. SLAB adds quite a bit of contextual information to logged events and instance name is one such extra bit of information.

`LogToWindowsAzureTable` method accepts additional parameters like table name for instance. If we omit it it will create a table called SLABLogsTable. Note that it will only create a new table if it doesn’t exist. Otherwise it will be appending to an existing table.

Then add logging calls to `RoleEntryPoint` and the start-up class:

```
public class WebRole : RoleEntryPoint
{
    public override bool OnStart()
    {
        InitializeLogging();
        TestEventSource.Log.LogRoleStart(Process.GetCurrentProcess().ProcessName);

        ...
    }
}

public class Startup
{
    public void Configuration(IAppBuilder app)
    {
        InitializeLogging();
        TestEventSource.Log.LogOwinStart(Process.GetCurrentProcess().ProcessName);

        ...
    }
}

```

Good, we’re ready to go! Hit F5 and our application runs. Let’s go check out the table storage:

[![SLAB logging output](https://blogcontent.azureedge.net/image_thumb_3.png "SLAB logging output")](https://blogcontent.azureedge.net/image_3.png)

As I mentioned there is a lot of contextual information, you can add keywords to your events but what I really like about Azure table storage sink is that you can create create custom payloads for your events that will be serialized as JSON and also a column will be added per each property you want to include with it.

Well, it runs well locally and we may not realize yet that we already have a problem. This is really frustrating because the emulator is letting us down. Let’s publish our service to Azure. Once published we are surprised to see that our role is recycling.

Try to enable RDP access to our role on the portal (or do that in the publish settings wizard). When you are in open up Event Viewer and expand Application and Services Logs/Windows Azure node. You will see errors like this:

An unhandled exception occurred. Type: **System.IO.FileLoadException** Process ID: 3660  
Process Name: **WaIISHost**  
Thread ID: 5  
AppDomain Unhandled Exception for role TestWebRole_IN_0  
Exception: **Could not load file or assembly 'Microsoft.WindowsAzure.Storage, Version=3.0.2.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35' or one of its dependencies. The located assembly's manifest definition does not match the assembly reference.** (Exception from HRESULT: 0x80131040)  
   at Microsoft.Practices.EnterpriseLibrary.SemanticLogging.Sinks.WindowsAzureTableSink..ctor(String instanceName, String connectionString, String tableAddress, TimeSpan bufferInterval, Int32 maxBufferSize, TimeSpan onCompletedTimeout)  
   at Microsoft.Practices.EnterpriseLibrary.SemanticLogging.WindowsAzureTableLog.LogToWindowsAzureTable(IObservable`1 eventStream, String instanceName, String connectionString, String tableAddress, Nullable`1 bufferingInterval, Boolean sortKeysAscending, Nullable`1 onCompletedTimeout, Int32 maxBufferSize)  
   at TestWebRole.WebRole.InitializeLogging() in f:\dev\_git\AzureSettingsUpdateSample\TestWebRole\WebRole.cs:line 34  
   at TestWebRole.WebRole.OnStart() in f:\dev\_git\AzureSettingsUpdateSample\TestWebRole\WebRole.cs:line 15

SLAB table storage sink requires the storage library of version 3.0.2.0 but earlier we added this library directly from nuget and we pulled the latest version (4.3.0 as of time of writing). This is pretty common, we could as well have updated the storage package. To deal with versioning and updates there is a mechanism in .NET that allows you to specifying that an application that was built against a certain version of a dependency can use another version of that dependency. This is called [assembly binding redirection](https://msdn.microsoft.com/en-us/library/vstudio/2fc472t2%28v=vs.100%29.aspx?f=255&MSPPError=-2147217396).

If you look at web.config file in our project you’re likely to find the following fragment:

```
<runtime>
  <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
    <dependentAssembly>
      <assemblyIdentity name="Microsoft.WindowsAzure.Storage" 
            publicKeyToken="31bf3856ad364e35" culture="neutral" />
      <bindingRedirect oldVersion="0.0.0.0-4.3.0.0" newVersion="4.3.0.0" />
    </dependentAssembly>
  </assemblyBinding>
</runtime>

```

It basically tells an application built against the storage library of any version from 0.0.0.0 to 4.3.0.0 to use the latest version 4.3.0.0.

But here’s the problem: web.config is going to be used by IIS worker process and it doesn’t affect WaIISHost process. Remember we added some logging to `RoleEntryPoint` and initialized an in-process sink for that. We want to add a similar assembly binding redirection to WaIISHost.exe but we can’t easily do that from our web project.

When you RDP to your role instance you can find the hosting applications in %ROLEROOT%\base\x64 directory. %ROLEROOT% is normally drive E: or F. The idea is to add (or modify if it exist) a configuration file for WaIISHost.exe assembly. We can do that with a PowerShell script that we are going to run as a Startup task for our role.

Let’s go and add a folder called Startup (it can be named whatever you like) to our project and add a .cmd as well as PowerShell script to it:

[![A startup task files](https://blogcontent.azureedge.net/image_thumb_4.png "A startup task files")](https://blogcontent.azureedge.net/image_4.png)

The reason we need a .cmd batch file is because we can’t run PowerShell scripts directly as cloud service roles’ startup tasks. The batch file is pretty simple:

```
IF "%IsEmulated%"=="true" goto :EOF 

cd %ROLEROOT%\approot\bin\Startup\
PowerShell -ExecutionPolicy Unrestricted -File 
    .\Apply-BindingRedirect.ps1 
    "%ROLEROOT%\base\x64\WaIISHost.exe.config" 
    "Microsoft.WindowsAzure.Storage" "31bf3856ad364e35" 
    "neutral" "0.0.0.0-4.3.0.0" "4.3.0.0" >> "%TEMP%\StartupLog.txt" 2>&1

:EOF 
EXIT /B %ERRORLEVEL%

```

It doesn’t do anything when you run the service under emulator and will run the PowerShell script when running in Azure. The PowerShell script is a bit lengthy to be posted here so I will just give a [link](https://bitbucket.org/dzimchuk/azuresettingsupdatesample/src/fa1a98c1c248e7d162a1b9b0bee951fefaf03b12/TestWebRole/Startup/Apply-BindingRedirect.ps1?at=master) to it.

In fact that repo on Bitbucket contains the whole test solution I’m using in this post.

So the script contains all the dreaded XML logic to add/update necessary elements for binding redirection. We just need to add the actual startup task to our role (ServiceDefinition.csdef file):

```
<WebRole name="TestWebRole" vmsize="ExtraSmall">
  ...
  <Startup>
    <Task commandLine="Startup\AddAssemblyBindings.cmd" 
        executionContext="elevated" taskType="simple">
      <Environment>
        <Variable name="IsEmulated">
          <RoleInstanceValue xpath="/RoleEnvironment/Deployment/@emulated" />
        </Variable>
      </Environment>
    </Task>
  </Startup>
</WebRole>

```

That’s it. Redeploy the service to Azure and check if it’s working.