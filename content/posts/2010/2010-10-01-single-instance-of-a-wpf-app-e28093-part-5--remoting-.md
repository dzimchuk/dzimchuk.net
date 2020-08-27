---
title: Single instance of a WPF app – part 5 (Remoting)
date: 2010-10-01T05:47:00.000Z
lastmod: 2015-04-23T17:13:16.000Z
permalink: single-instance-of-a-wpf-app-e28093-part-5--remoting-
uuid: 041aee16-e9de-4e09-90f6-ebfb005d550a
tags: WPF
---

When I blogged about a [WCF solution](Single-instance-of-a-WPF-app-e28093-part-3-(WCF)) some time ago I mentioned another option to implement this feature by using a fast Remoting channel. That sprang up in my mind again and I decided to give it a try. As a result I got a very neat and fast solution. Interested? Read on!

.NET Framework 2.0 introduced a new channel called IPC. It is designed for interprocess and interdomain communication within a single box. It is based on Named Pipes and is supposed to be faster than TCP and HTTP channels. In my WCF solution I also used a Named Pipes binding but it was almost 2 timers slower than my first solution that was based on WM_COPYDATA Windows message. Can I get a decent result with IPC Remoting channel?

## Usage

The usage of the `SingleInstance` helper remains unchanged. See [WCF solution](Single-instance-of-a-WPF-app-e28093-part-3-(WCF)) for details.

## Service Activation

Remoting allows you to choose from a server activation and a client activation. When using a server activation we can set up our service to be a singleton or alternatively we can configure the infrastructure to instantiate a service instance for each call. When using client activation the service instance is created for each client when he creates a proxy.

I went for the client activation as I need to call 2 methods on the service (`BringToFront` and `ProcessArgs`) and I don’t need the service to be re-instantiated each time. I could use a singleton just as well. There is no real benefit or downside in each of the option as it applies to our case.

## Remotable object

The remotable object is a private inner class of the `SingleInstance` helper. Here it is in its entirety:

```
private class Bridge
{
    public event Action<Guid> BringToFront;
    public event Action<Guid, string[]> ProcessArgs;

    public void OnBringToFront(Guid appGuid)
    {
        if (BringToFront != null)
            BringToFront(appGuid);
    }

    public void OnProcessArgs(Guid appGuid, string[] args)
    {
        if (ProcessArgs != null)
            ProcessArgs(appGuid, args);
    }

    private static readonly Bridge _instance = new Bridge();

    static Bridge()
    {
    }

    public static Bridge Instance
    {
        get { return _instance; }
    }
}

private class RemotableObject : MarshalByRefObject
{
    public void BringToFront(Guid appGuid)
    {
        Bridge.Instance.OnBringToFront(appGuid);
    }

    public void ProcessArguments(Guid appGuid, string[] args)
    {
        Bridge.Instance.OnProcessArgs(appGuid, args);
    }
}
```

As you can see the remotable object exposes two operations for the clients to call: `BringToFront` and `ProcessArgs`. These calls must be effectively transferred to the `SingleInstance` class. In my WCF solution I used to pass delegates to the constructor of the service however it’s not as easy to do with Remoting. Although Remoting services with client activation support non-default constructors it’s of no use for us as the parameters are passed from the client while we need to pass delegates that point to methods on the server side (“server” means the 1st instance of our application).

In the WCF solution I solved this problem by turning my `SingleInstance` helper into an instance provider. It seems trickier to hook into Remoting infrastructure to supply a custom instance provider (or am I missing something?) so I decided to work around it with a simple helper class that I called `Bridge`.

The `Bridge` is a singleton. I used a great pattern described [here](http://www.yoda.arachsys.com/csharp/singleton.html). Seriously, if you think you know how to implement a singleton in C# in the most efficient way just give that article a glance to make sure you really know the most efficient way.

`SingleInstance` subscribes to the event that the `Bridge` exposes in its constructor:

```
public SingleInstance(Guid appGuid)
{
    _appGuid = appGuid;
    _assemblyName = 
        Assembly.GetExecutingAssembly().GetName().Name;

    Bridge.Instance.BringToFront += BringToFront;
    Bridge.Instance.ProcessArgs += ProcessArgs;

    _mutex = 
        new Mutex(true, _assemblyName + _appGuid, out _owned);
}
```

Implementation of `BringToFront` and `ProcessArgs` is almost identical to the WCF solution. The only difference is that now we need to manually synchronize with the WPF UI thread:

```
private void BringToFront(Guid appGuid)
{
    if (appGuid == _appGuid)
    {
        _window.Dispatcher.BeginInvoke((ThreadStart)delegate()
            {
                if (_window.WindowState == WindowState.Minimized)
                    _window.WindowState = WindowState.Normal;
                _window.Activate();
            });
    }
}

private void ProcessArgs(Guid appGuid, string[] args)
{
    if (appGuid == _appGuid && ArgsRecieved != null)
    {
        _window.Dispatcher.BeginInvoke((ThreadStart)delegate()
        {
            ArgsRecieved(args);
        });
    }
}
```

We didn’t have to do that before because when you host a WCF service within a WPF application and create a `ServiceHost` on a UI thread it will join the synchronization context.

The server side and the client side code that uses Remoting is pretty straightforward and is shown in the following listing:

```
// server side
private void StartService()
{
    try
    {
        IpcServerChannel channel = new IpcServerChannel("pvp");
        ChannelServices.RegisterChannel(channel, false);

        RemotingConfiguration.
          RegisterActivatedServiceType(typeof(RemotableObject));
    }
    catch
    {  // log it
    }
}

// client side
private void SendCommandLineArgs(string[] args)
{
    try
    {
        IpcClientChannel channel = new IpcClientChannel();
        ChannelServices.RegisterChannel(channel, false);

        RemotingConfiguration.
          RegisterActivatedClientType(typeof(RemotableObject), 
                                      "ipc://pvp");

        RemotableObject proxy = new RemotableObject();
        proxy.BringToFront(_appGuid);
        proxy.ProcessArguments(_appGuid, args);
    }
    catch
    { // log it
    }
}
```

Basically that’s it. Please download the sample code and check out the whole class. it is in SingleInstanceApp4 project.

## Performance

The most interesting part… 22 seconds (starting 300 instances and passing their arguments to the 1st instance). It’s practically 2 times faster than WCF (40 seconds) and almost as fast as WM_COPYDATA (~20 seconds).

Don’t get me wrong, WCF is fast as hell but it loses because the service model needs to load each time we start an application.

Is this solution a winner? I guess so, 10% (2 seconds) loss compared to WM_COPYDATA is really negligible in this case, it’s like ~7 ms of the startup time. But the code is much smaller and there is no direct PInvoke.

[SingleInstanceApp4.zip (154.96 kb)](https://blogcontent.azureedge.net/2010%2f10%2fSingleInstanceApp4.zip)