---
title: Single instance of a WPF app – part 2 (WM_COPYDATA)
date: 2010-08-14T00:28:00.000Z
lastmod: 2015-04-23T17:37:54.000Z
permalink: single-instance-of-a-wpf-app-e28093-part-2--wmcopydata-
uuid: 2396b28d-d7d2-49c4-9f1c-4c7d94ec5a94
tags: WPF
---

When I started on the [Power Video Player](http://pvp.codeplex.com/) in 2003 I knew that a single instance for the video player application was a must. PVP was a C++ MFC-based prototype at that time and I was reading about corresponding and close technologies on [CodeProject](http://www.codeproject.com), [CodeGuru](http://www.codeguru.com) and where not. I hit upon an [article](http://www.flounder.com/nomultiples.htm) written by Joseph M. Newcomer and really liked the proposed design.

Later on in 2004 I was porting PVP to .NET and implemented the design as a handy component that you can use in a Windows Forms application. You can get the code from [CodePlex](http://pvp.codeplex.com/SourceControl/list/changesets) and look for a class called `SingleInstance`.

Now that I’m contemplating the next generation of PVP which is going to be a WPF application I need to decide how I’m going to implement single instancing. I’ve already touched on the options in my [introductory post](/single-instance-of-a-wpf-app-e28093-part-1--introduction-).

As this design has served me well over the years it will be the 1st option I will consider. By explaining what’s going on inside `SingleInstance` class I will also do a favor to the folks who want to a use the Windows Forms’ version.

`SingleInstance` class encapsulates the behavior of detecting if the application is the first instance, triggering a provided logic to show the window if yes or sending the command line arguments and shutting down the application if no.

## Usage

Let’s start with the way you use it with your WPF application:

```
public partial class App : Application
{
    private readonly Guid _appGuid = 
         new Guid("{174ECDE3-BC6B-4AF9-8D38-539EF5E76D2B}");

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
        // process the command line arguments of 
        // another instance here
    }
}
```

All the action happens in the `Startup` event of the `Application` class or directly in `OnStartup` virtual method. If you use Visual Studio make sure to **remove** `StartupUri` attribute from App.xaml as we will control the creation of the main window ourselves.

The constructor of `SingleInstance` requires a Guid. Why? This identifier will be used to form a unique mutex name for your application as well as it will help to insure that we are communicating the command line arguments to another instance of ourselves, i.e. the application that carries the same identifier.

Once we have constructed `SingleInstance` we subscribe to `ArgsRecieved` event. This event will be fired in the 1st instance of our application when another instance starts up.

## The Run method

We kick things off by calling `Run` method. The first argument is `System.Func<Window result)` delegate that allows us to provide our logic to create and show the main application window. This delegate will be called only when this is the 1st instance of an application. We need to return the `Window` object to `SingleInstance` so that the latter could hook to its window procedure. The hook is necessary to intercept WM_COPYDATA and our custom message that is used to locate another already running instance of an application.

The 2nd arguments is an array of command line arguments that will be sent to the 1st instance in case the current instance is not the 1st one.

Let’s take a closer look at the `Run` method:

```
public void Run(Func<Window> showWindow, string[] args)
{
    if (_owned)
    {
        // show the main app window
        Window wnd = showWindow();

        // add a hook
        WindowInteropHelper helper = 
            new WindowInteropHelper(wnd);

        if (helper.Handle == null)
        {
          throw 
          new Exception("Main window must be shown before adding a hook");
        }

        _hwndSource = 
            HwndSource.FromHwnd(helper.Handle);

        hwndSource.AddHook(MessageHook);
    }
    else
    {
        BringToFront();
        SendCommandLineArgs(args);
        Application.Current.Shutdown();
    }
}
```

There 2 code paths defined by the value of the private Boolean variable _owned. What’s owned? The mutex. If we own it we are the 1st instance, if not we just need to bring the 1st instance on top, send it our argument and exit.

The named mutex is obtained in the constructor of `SingleInstance`:

```
public SingleInstance(Guid appGuid)
{
    _appGuid = appGuid;
    string asssemblyName = 
        Assembly.GetExecutingAssembly().GetName().Name;

    _mutex = 
        new Mutex(true, asssemblyName + _appGuid, out _owned);

    // the rest of the constructor is omitted for now...
}
```

Note that we generate a unique name for the mutex by concatenating the assembly name and the application identifier that we passed to the constructor.

If you explicitly dispose an object that encapsulates an open mutex you need to release it:

```
class SingleInstance : IDisposable
{
    private Mutex _mutex;
    private bool _owned;
    private HwndSource _hwndSource;

    public void Dispose()
    {
        if (_owned) // always release a mutex if you own it
        {
            _owned = false;
            _mutex.ReleaseMutex();
        }

        if (_hwndSource != null)
        {
            _hwndSource.RemoveHook(MessageHook);
            _hwndSource = null;
        }
    }

    // the rest of the class is omitted
}
```

However, if `Dispose()` is called from Finalizer you shouldn't call `_mutex.ReleaseMutex()` as it's going to be released through its own finalizer. There is no Finalizer in `SingleInstance` class.

In fact `SingleInstance` is not supposed to be disposed explicitly. It’s going to live as long as the whole application lives. It is protected from garbage collection by the fact that we have installed a hook and the WPF infrastructure will keep a reference to `SingleInstance` class until we remove the hook. If you decide to call `Dispose ()`on `SingleInstance` it will gracefully clean up and become eligible for garbage collection.

## The hook

Back to the `Run` method. Once the main window is shown we add a hook to it. In WPF you do it with a help of `WindowInteropHelper` and `HwndSource` classes. They both live in `System.Windows.Interop` namespace that contains helper classes for interoperability of WPF applications with windows applications built with other technologies (Windows Forms, Win32).

Let’s have a look at the hook procedure:

```
private IntPtr MessageHook(IntPtr hwnd,
                           int msg,
                           IntPtr wParam,
                           IntPtr lParam,
                           ref bool handled)
{
    IntPtr ret = IntPtr.Zero;
    handled = false;

    if (msg == (int)WindowsMessages.WM_COPYDATA)
    {
        WindowsManagement.COPYDATASTRUCT cds =
        (WindowsManagement.COPYDATASTRUCT)Marshal.PtrToStructure(
        lParam, typeof(WindowsManagement.COPYDATASTRUCT));

        // extra check if it's us
        if (cds.dwData == SingleInstance.COPYDATA_TYPE_FILENAME)
        {
            MemoryStream stream = null;
            try
            {
                byte[] abyte = new byte[cds.cbData];
                Marshal.Copy(cds.lpData, abyte, 0, cds.cbData);
                stream = new MemoryStream(abyte);

                BinaryFormatter formatter = 
                    new BinaryFormatter();
                ArgsPacket packet = 
                    (ArgsPacket)formatter.Deserialize(stream);

                // also check app guid
                if (packet.AppGuid == _appGuid)
                {
                    // now we know this is us
                    handled = true;

                    if (ArgsRecieved != null)
                        ArgsRecieved(packet.Args);

                    ret = new IntPtr(1);
                }
            }
            catch
            { // log it or do what you want
            }
            finally
            {
                if (stream != null)
                    stream.Close();
            }
        }
    }
    else if (msg == (int)UWM_ARE_YOU_ME)
    {
        ret = (IntPtr)UWM_ARE_YOU_ME;
        handled = true;
    }

    return ret;
}
```

There are 2 messages that we are interested in:

*   WM_COPYDATA
*   UWM_ARE_YOU_ME

## WM_COPYDATA

I use classes from my napi assembly containing definitions for various PInvoke functions, structures and values. I included `WindowsMessages` and `WindowsManagement` classes in the sample code download (you will find the link at the end of this post).

WM_COPYDATA is processed by the 1st instance of our application when other instances send their command line arguments. We perform a double check to make sure the message is really intended for us. First we check the `dwData` field of the `COPYDATASTRUCT` structure. This field contains an arbitrary integer, I’ve picked one so all instances of the application put the same value there. And after we deserialize the actual data package (represented with a custom `ArgsPacket` structure defined in `SingleInstance`) we also check if it contains our application’s GUID. `SingleInstance` can be reused by different applications and `dwData` is likely to contain the same value, however each application has its own unique GUID.

Note that `COPYDATASTUCT` contains pointers to unmanaged memory so we need to use `System.Runtime.InteropServices.Marshal` class to copy the data into managed memory space. If you ever did a considerable amount of PInvok’ing you should know how invaluable this class is.

Ok, we’ve had a look at the receiving code. What about the sending part? Here it is:

```
private void SendCommandLineArgs(string[] args)
{
    if (_hWndOther != IntPtr.Zero)
    {
        IntPtr buffer = IntPtr.Zero;
        IntPtr pcds = IntPtr.Zero;
        MemoryStream stream = null;
        try
        {
            ArgsPacket packet = 
                new ArgsPacket { AppGuid = _appGuid, 
                                 Args = args };

            stream = new MemoryStream();
            BinaryFormatter formatter = new BinaryFormatter();
            formatter.Serialize(stream, packet);

            byte[] abyte = stream.ToArray();
            buffer = Marshal.AllocCoTaskMem(abyte.Length);
            Marshal.Copy(abyte, 0, buffer, abyte.Length);

            WindowsManagement.COPYDATASTRUCT cds = 
                new WindowsManagement.COPYDATASTRUCT();
            cds.dwData = COPYDATA_TYPE_FILENAME;
            cds.cbData = abyte.Length;
            cds.lpData = buffer;

            pcds = Marshal.AllocCoTaskMem(Marshal.SizeOf(cds));
            Marshal.StructureToPtr(cds, pcds, true);

            WindowsManagement.SendMessage(_hWndOther, 
                (int)WindowsMessages.WM_COPYDATA, 
                IntPtr.Zero, pcds);

        }
        catch
        { // oh, swallowing block?
        } // yes, if you have better ideas extend it
        finally
        {
            if (buffer != IntPtr.Zero)
                Marshal.FreeCoTaskMem(buffer);
            if (pcds != IntPtr.Zero)
                Marshal.FreeCoTaskMem(pcds);
            if (stream != null)
                stream.Close();
        }
    }
}
```

Ok, things seem to be happening in the reverse order here. Note that we have to allocate an unmanaged block of memory twice: first for the `ArgsPacket` serialized data and then for `COPYDATASTRUCT`. All pointers that you send with WM_COPYDATA must be in unmanaged memory space.

Noticed that `_hWndOther`? This is a HWND of the window of the 1st instance of our application. How do other instances know it?

It has a lot to do with the UWM_ARE_YOU_ME message that we process in the hook procedure.

## UWM_ARE_YOU_ME

Let me show the full constructor of `SingleInstance` now:

```
public SingleInstance(Guid appGuid)
{
    _appGuid = appGuid;
    string asssemblyName = 
        Assembly.GetExecutingAssembly().GetName().Name;

    _mutex = 
        new Mutex(true, asssemblyName + _appGuid, out _owned);
    UWM_ARE_YOU_ME = 
        WindowsManagement.RegisterWindowMessage(asssemblyName
        + appGuid);

    if (!_owned)
        WindowsManagement.EnumWindows(
          new WindowsManagement.EnumWindowsProc(SearchCallback),
          IntPtr.Zero);
}

private int SearchCallback(IntPtr hWnd, IntPtr lParam)
{
    int result;
    int ok = WindowsManagement.SendMessageTimeout(hWnd,
        (int)UWM_ARE_YOU_ME,
        IntPtr.Zero, IntPtr.Zero,
        (WindowsManagement.SMTO_BLOCK | 
         WindowsManagement.SMTO_ABORTIFHUNG),
        100, out result);
    if (ok == 0)
        return 1; // ignore this and continue
    if (result == (int)UWM_ARE_YOU_ME)
    { // found it
        _hWndOther = hWnd;
        return 0; // stop search
    }
    return 1; // continue
}
```

If we don’t own the mutex (that is we are not the 1st instance) we try to locate the window of the 1st instance using `EnumWindows` API. It enumerates all top-level windows on the screen and passes UWM_ARE_YOU_ME message to each of them.

UWM_ARE_YOU_ME is a our own custom registered Windows message. We register it by providing a unique name consisting of the assembly name and the application identifier. The message actually gets registered once when the 1st instance calls `RegisterWindowMessage` function. All subsequent calls to this function with the same name will just return the code (integer) of the already registered message.

Thus all are instances share the same UWM_ARE_YOU_ME message code. And by responding to it with the same message code (see window hook above) we can detect another running instance of our application and get the HWND of its window.

## Last touch

We are almost done. Let’s just have a look at the 2nd code path in the `Run` method once again:

```
public void Run(Func<Window> showWindow, string[] args)
{
    if (_owned)
    {
        // omitted
    }
    else
    {
        BringToFront();
        SendCommandLineArgs(args);
        Application.Current.Shutdown();
    }
}
```

We’ve already seen how to send and receive command line arguments. What we also do here is bringing the 1st instance of our application on top. This is also done with a bit of PInvoke:

```
private void BringToFront()
{
    if (_hWndOther != IntPtr.Zero)
    {
        if (WindowsManagement.IsIconic(_hWndOther) != 0)
            WindowsManagement.ShowWindowAsync(_hWndOther, 
            WindowsManagement.SW_RESTORE);
        WindowsManagement.SetForegroundWindow(_hWndOther);
    }
}
```

I’m a good guy so I included my PInvoke helpers with the sample download. You might also want to check out the full napi assembly from [PVP source code](http://pvp.codeplex.com/SourceControl/list/changesets). I added stuff there in an ad-hoc manner as I needed it so don’t get mad if you don’t find something there. It’s not that hard to write your own definitions.

The last thing that we do after we’ve sent the command line arguments is shut down our instance. We must do it explicitly otherwise our other instances will keep running without open windows.

Phew! Confused? Don’t be, just check out the sample code.

[SingleInstanceApp.zip (41.33 kb)](https://blogcontent.azureedge.net/2010%2f8%2fSingleInstanceApp.zip)