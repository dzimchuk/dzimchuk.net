---
title: Single instance of a WPF app – part 4 (WindowsFormsApplicationBase)
date: 2010-08-16T04:52:00.000Z
lastmod: 2015-04-23T17:33:34.000Z
permalink: single-instance-of-a-wpf-app-e28093-part-4--windowsformsapplicationbase-
uuid: 56bb6150-3ee7-45cc-b181-652e0ae76c72
tags: WPF
---

In my [intoductory post](/single-instance-of-a-wpf-app-e28093-part-1--introduction-) I mentioned another way to implement a single instance WPF application by making use of `Microsoft.VisualBasic.ApplicationServices.WindowsFormsApplicationBase` class. This scenario is also covered in the [great book on WPF](http://www.apress.com/book/view/9781430272052) by Matthew MacDonald and I thought my story wouldn’t be complete without looking at this option.

`Microsoft.VisualBasic.ApplicationServices` namespace lives in Microsoft.VisualBasic assembly and contains classes to facilitate [Visual Basic Application Model](http://msdn.microsoft.com/en-us/library/w3xx6ewx(VS.80).aspx), which is essentially a bunch of useful helpers that allow you to conveniently perform various tasks at the startup and shutdown of a Windows Forms application.

> _- dude! I thought we were talking about WPF?  
> - yeah, I remember, just hold on a sec._

One of those handy classes is `WindowsFormsApplicationBase` that (among other features) provides a way to enable a single instance of your Windows Forms application as easy as setting its `IsSingleInstance` property to True **before** running your application and overriding a couple of virtual methods (or subscribing to corresponding events if you prefer that model):  `OnStartup` and `OnStartupNextInstance`. The 1st will get called when the 1st instance of an application starts up and the second will get called each time another instance starts up. Those other instances will be shut down for you automatically.

The beauty of this model is that we get the command line arguments in both of these events so we don’t have to worry how to pass them across process boundaries ourselves.

Under the hood `WindowsFormsApplicationBase` uses Remoting over the TCP channel to pass the credentials. I was trying to avoid this design as I didn’t want to mess with ports.

> _- what about WPF??_

Ah! You’re still there!. Good, the idea is to wrap a WPF application with `WindowsFormsApplicationBase`. If it doesn’t hurt your feelings, read on. Otherwise take a practice to implement a standalone Remoting solution similar to my [WCF-based one](Single-instance-of-a-WPF-app-e28093-part-3-(WCF)).

## Usage

If you use Visual Studio to create a WPF application skeleton, **delete** App.xaml and App.xaml.cs files first. Instead you’re going to add your own entry point to your application. Just add a new class and type the Main method like this:

```
class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        WindowsFormsApp wrapper = new WindowsFormsApp();
        wrapper.Run(args);
    }
}
```

That’s it. By calling ‘`Run`’ you start the Windows Forms application.

## The wrapper

Our `WindowsFormsApp` derives from `WindowsFormsApplicationBase`and encapsulates the WPF application. It contains all the logic necessary to drive a single instance behavior:

```
class WindowsFormsApp : WindowsFormsApplicationBase
{
    private App _wpfApp;

    public WindowsFormsApp()
    {
        // enable Single Instance behavior
        IsSingleInstance = true;
    }

    protected override bool OnStartup(StartupEventArgs e)
    {
        // we are here when the 1st instance starts up
        // start the WPF app
        _wpfApp = new App();
        _wpfApp.Run();

        return false;
    }

    protected override void OnStartupNextInstance(
        StartupNextInstanceEventArgs e)
    {
        if (e.CommandLine.Count > 0)
        {
            _wpfApp.ProcessArguments(e.CommandLine.ToArray());
        }
    }
}
```

It’s that simple.

## The WPF app

The `App` class you saw in the previous code snippet is a regular WPF application class that derives from `System.Windows.Application`.

```
class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        MainWindow window = new MainWindow();
        window.Show();
    }

    public void ProcessArguments(string[] args)
    {
        // process command line arguments
        // of other instances
    }
}
```

What about performance? It passed my test within 25 seconds. Almost as fast as the [WM_COPYDATA](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA)) solution and considerably faster than the [WCF one](Single-instance-of-a-WPF-app-e28093-part-3-(WCF)) that uses named pipes.

[SingleInstanceApp3.zip (101.54 kb)](https://blogcontent.azureedge.net/2010%2f8%2fSingleInstanceApp3.zip)