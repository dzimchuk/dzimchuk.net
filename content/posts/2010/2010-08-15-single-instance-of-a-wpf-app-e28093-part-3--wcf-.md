---
title: Single instance of a WPF app – part 3 (WCF)
date: 2010-08-15 09:45:00
permalink: single-instance-of-a-wpf-app-e28093-part-3--wcf-
uuid: 91677380-539f-478c-af1a-69790ec4fe59
tags: WPF
---

Last time I blogged about a way to implement a single instance feature using [WM_COPYDATA](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA)) Win32 mechanism. It involves a bit of PInvoke but still works perfectly well with WPF. This implementation dates back to .NET 1.1 and to be more precise – the old Win32 days as it was inspired by [Joseph M. Newcomer's article](http://www.flounder.com/nomultiples.htm).

A lot of things have changed since then. An eager mind is always up to something new so I’ve decided to consider an alternative. Can the current standard communication framework from Microsoft offer a better option to meet my [requirements](Single-instance-of-a-WPF-app-e28093-part-1-(introduction))?

I’m going to re-implement the `SingleInstance` helper so that it uses WCF to communicate command line arguments to the 1st running instance of my application and doesn’t rely on PInvoke at all. As a I need a a fast communication within a machine boundaries named pipes is a logic choice for a transport protocol.

## Usage

The external interface to `SignleInstance` component remain absolutely intact:

```
public partial class App : Application
{
    private readonly Guid _appGuid = 
        new Guid("{C307A02B-6F41-4996-B330-97045F4A07BC}");

    protected override void OnStartup(StartupEventArgs e)
    {
        SingleInstance si = new SingleInstance(_appGuid);
        si.ArgsRecieved += 
            new SingleInstance.ArgsHandler(si_ArgsRecieved);

        si.Run(() =>
        {
            new MainWindow().Show();
            return this.MainWindow;
        }, e.Args);
    }

    private void si_ArgsRecieved(string[] args)
    {
        // process arguments of another instance
    }
}
```

Please refer to the [previous post](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA)) for explanation on what’s going on here.

## The Run method

Here’s the revised version of the `Run` method:

```
public void Run(Func<Window> showWindow, string[] args)
{
    if (_owned)
    {
        // show the main app window
        _window = showWindow();
        // and start the service
        StartServiceHost();
    }
    else
    {
        SendCommandLineArgs(args);
        Application.Current.Shutdown();
    }
}
```

There is no window hook any more as we are not going to communicate through windows messages any more. Instead we start up a WCF service:

```
private string GetAddress()
{
    return string.Format("net.pipe://localhost/{0}{1}", 
        _assemblyName, _appGuid);
}

private Binding GetBinding()
{
    return new NetNamedPipeBinding(NetNamedPipeSecurityMode.None);
}

private void StartServiceHost()
{
    try
    {
        _host = new ServiceHost(typeof(SingleInstanceService));
        ServiceEndpoint endpoint = 
          _host.AddServiceEndpoint(typeof(ISingleInstanceService),
                                   GetBinding(),
                                   GetAddress());
        endpoint.Behaviors.Add(this);
        _host.Open();
    }
    catch
    {
        _host = null;
        // log it
    }
}
```

Nothing extraordinary here. Two things are worth mentioning:

1.  we form a unique listening URI by concatenating the assembly name and the application GUID;
2.  we disable the security on the named pipes binding.

By default `NetNamedPipeBinding` has a transport security enabled (the only security mode supported by this binding) with Windows credential type (which is also used for encryption and signing). I disabled security to get the best performance possible but your application requires it you can enable it. Strangely enough my performance tests didn’t show a major performance drop (about 10%).

## The service

It’s just a communication layer, it has no logic to affect the application behavior, its sole purpose is to receive messages and pass them up to the `SingleInstance` component:

```
[ServiceContract]
interface ISingleInstanceService
{
    [OperationContract(IsOneWay=true)]
    void BringToFront(Guid appGuid);

    [OperationContract(IsOneWay=true)]
    void ProcessArguments(Guid appGuid, string[] args);
}

[ServiceBehavior(
    InstanceContextMode=InstanceContextMode.PerSession, 
    ConcurrencyMode=ConcurrencyMode.Single, 
    UseSynchronizationContext=true)]
class SingleInstanceService : ISingleInstanceService
{
    private Action<Guid> bringToFrontCallback;
    private Action<Guid, string[]> processArgsCallback;

    public SingleInstanceService()
    {
    }

    public SingleInstanceService(
        Action<Guid> bringToFrontCallback, 
        Action<Guid, string[]> processArgsCallback)
    {
        this.bringToFrontCallback = bringToFrontCallback;
        this.processArgsCallback = processArgsCallback;
    }

    public void BringToFront(Guid appGuid)
    {
        bringToFrontCallback(appGuid);
    }

    public void ProcessArguments(Guid appGuid, string[] args)
    {
        processArgsCallback(appGuid, args);
    }
}
```

Although parameters I’ve specified for `ServiceBehavior` are at their default values this is a conscious choice that I’m going to explain now.

I could have set `InstanceContextMode` to `Single` as there is no point to re-instantiate the service instance and the `SingleInstance` itself is a single instance that lives for the whole application’s life period (too many ‘single instances’ for a single sentence, haha!). However, here’s the catch: I need to pass 2 delegates to the service so it could trigger certain actions in `SingleInstance` and thus I need to use a non-default constructor. But! singleton service instances are not instantiated when calls are received. Instead they are instantiated when you open up a `ServiceHost`! And the default `ServiceHost` requires a parameterless constructor. By the way that’s why there is a default constructor. Without it this statement would fail:

```
_host = new ServiceHost(typeof(SingleInstanceService));
```

This constructor is NOT used to actually instantiate our service instance. It’s just there to pass the default `ServiceHost’s` check.

I choose to join the synchronization context (`UseSynchronizationContext=true`) because my host is a WPF Windows application and I will need to synchronize with the UI thread to react to `BringToFront` `ProcessArguments` method anyway. I also set the `ConcurrencyMode` to `Single` because the messages will be queued for the single UI thread anyway.

Ok, how are you going to instantiate the service instance via a non-default constructor? We need a custom service instance provider. And our `SingleInstance` class itself is the one:

```
class SingleInstance : IDisposable, 
    IInstanceProvider, IEndpointBehavior
{
    public object GetInstance(InstanceContext instanceContext, 
                                              Message message)
    {
        return 
            new SingleInstanceService(BringToFront, ProcessArgs);
    }

    public void ApplyDispatchBehavior(ServiceEndpoint endpoint, 
                        EndpointDispatcher endpointDispatcher)
    {
       endpointDispatcher.DispatchRuntime.InstanceProvider = this;
    }

    // the rest of the class is omitted
}
```

How does it hook? Take a look at the method where we create the `ServiceHost`. Here’s the key statements:

```
ServiceEndpoint endpoint = 
    _host.AddServiceEndpoint(typeof(ISingleInstanceService),
                             GetBinding(),
                             GetAddress());
endpoint.Behaviors.Add(this); //add itself as an endpoint behavior
```

That last statement also keeps `SingleInstance` away from garbage collection. If you call Dispose() it's going to shut down the service and become eligible for grabage collection. However, you are not likely to do it. `SingleInstance` is likely to live as long as your application lives.

Implementation of BringToFront and ProcessArguments method is pretty straightforward:

```
private void BringToFront(Guid appGuid)
{
    if (appGuid == _appGuid)
    {
        if (_window.WindowState == WindowState.Minimized)
            _window.WindowState = WindowState.Normal;
        _window.Activate();
    }
}

private void ProcessArgs(Guid appGuid, string[] args)
{
    if (appGuid == _appGuid && ArgsRecieved != null)
    {
        ArgsRecieved(args);
    }
}
```

Interestingly enough, `WindowState.Normal` actually restores the window to its previous state before it was minimized. So if it was maximized before it will be restored maximized. This corresponds to the behavior you get with `SW_RESTORE` when calling `ShowWindow(Async)` WinAPI.

## Sending command line arguments

When other instances of our application start and detect they are not the 1st one they need to send their command line arguments and exit:

```
public void Run(Func<Window> showWindow, string[] args)
{
    if (_owned)
    {
        // omitted
    }
    else
    {
        SendCommandLineArgs(args);
        Application.Current.Shutdown();
    }
}

private void CloseCommunicationObject(
    ICommunicationObject commObject)
{
    try
    {
        commObject.Close();
    }
    catch
    {
        commObject.Abort();
    }
}

private void SendCommandLineArgs(string[] args)
{
    ISingleInstanceService proxy = null;
    try
    {
        proxy = ChannelFactory<ISingleInstanceService>.
                CreateChannel(GetBinding(), 
                           new EndpointAddress(GetAddress()));
        proxy.BringToFront(_appGuid);
        proxy.ProcessArguments(_appGuid, args);
    }
    catch
    { // log it
    }
    finally
    {
        if (proxy != null)
            CloseCommunicationObject(proxy 
                                     as ICommunicationObject);
    }
}
```

## Performance comparison

That’s all there is to talk about the new implementation. Check out the sample code below if you have any uncertainties.

Now I need to make some conclusion as how this new version compares to the [old and proven one](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA)). It certainly works but we now have a dependency on the service model (and not all applications need it) and can we make any statement about its performance.

I did a simple test: launch 300 instances of the application and see how long it takes the 1st instance to receive command line arguments from them all. This is a rough test but it does cover my major concern – initialization of the service model that will be done each time you launch your application.

The results:

*   WCF (no security): 41 sec
*   WCF (default transport security): 43 sec
*   WM_COPYDATA: 18 sec

I was a bit surprised by the first 2 lines but WM_COPYDATA confirmed my expectations. Note that in all cases we push all messages to the UI thread’s queue. So we are ultimately limited to 1 thread, that is it’s a fair play.

2x times can be acceptable for some business applications, especially those that would require WCF for their core logic anyway. There could also be cases when PInvoke is not desirable.

But for my video player application I see no reason to lose this bit of performance and I even see it as a serious degrading. When you start up the 1st instance it opens up the `ServiceHost` – this is a notable delay for this kind of an application. I may (and will) use WCF for other purposes (online catalogs, etc) but this specific feature is best done with [WM_COPYDATA](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA)).

The code:

[SingleInstanceApp2.zip (72.25 kb)](https://blogcontent.azureedge.net/2010%2f8%2fSingleInstanceApp2.zip)