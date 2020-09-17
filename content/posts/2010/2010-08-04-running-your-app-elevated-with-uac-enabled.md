---
title: Running your app elevated with UAC enabled
date: 2010-08-04T05:30:00.000Z
lastmod: 2015-04-23T17:42:25.000Z
permalink: running-your-app-elevated-with-uac-enabled
uuid: feff3c9e-1222-4ba6-9300-64b7a1980c21
tags: Windows Programming
---

In my previous post about [a component for file associations](/a-component-to-perform-file-associations) I described the way to do initial registration and mentioned the fact that it must be done with Administrator permissions as (especially with Default Programs) we need to put a bunch a stuff under HKEY_LOCAL_MACHINE registry key.

Although this registration is normally done when you install [PVP](http://pvp.codeplex.com/) and as the installer elevates the process anyway, I added 2 command line switched to pvp.exe so you could re-register and un-register it without an installer:

*   pvp.exe –regapp
*   pvp.exe –unregapp

Thus, PVP needs to be able to elevate itself (if the user chooses to do so, of course). It’s probably documented in a lot of places on web so don’t get angry at me if I repeat it. I just want to make my previous post complete.

So here’s the PVP’s entry point:

```
[STAThread]
static void Main(string[] args) 
{
    if (Array.Find(args,
            delegate(string arg)
            {
                string s = arg.ToLowerInvariant();
                return s == "-regapp" || s == "/regapp";
            }
           ) != default(string))
    {
        HandleRegApp();
        return;
    }
    else if (Array.Find(args,
            delegate(string arg)
            {
                string s = arg.ToLowerInvariant();
                return s == "-unregapp" || s == "/unregapp";
            }
        ) != default(string))
    {
        HandleUnRegApp();
        return;
    }

    // regular Windows Forms application startup
    // omitted here
}
```

Cut me some slack if argument parsing doesn’t look elegant enough to you but it’s stable enough and it was ok for me.

So basically if we launch the application with either ‘regapp’ or ‘unregapp’ command line switches we don’t start the Windows Forms application. Instead we just fire our predefined actions `HandleRegApp()` or `HandleUnRegApp():`

```
public static void HandleRegApp()
{
    if (IsAdmin)
    {
       // do something here that requires
       // elevated permissions
    }
    else
    {
        Elevate("-regapp");
    }
}

public static void HandleUnRegApp()
{
    if (IsAdmin)
    {
       // do something here that requires
       // elevated permissions
    }
    else
    {
        Elevate("-unregapp");
    }
}
```

Why are these methods public? That’s because they are also invoked by the custom installer at install and uninstall time.

How do we determine if we are running with Administrator permissions? We get the `WindowsPrincipal` of the account we are executing as and check if it has `WindowsBuiltInRole.Administrator` role:

```
private static bool IsAdmin
{
    get
    {
        WindowsIdentity identity = 
             WindowsIdentity.GetCurrent();
        WindowsPrincipal principal = 
             new WindowsPrincipal(identity);
        return 
         principal.IsInRole(WindowsBuiltInRole.Administrator);
    }
}
```

The only thing that’s left is actually the `Elevate(…)` method:

```
private static void Elevate(string command)
{
    // do not elevate if it's already being elevated, 
    // i.e. if -elevate is specified we won't try to run 
    // another process (it shouldn't happen 
    // but an extra protection won't harm)
    if (Array.Find(Environment.GetCommandLineArgs(), 
                delegate(string arg)
                {
                    string s = arg.ToLowerInvariant();
                    return s == "-elevate" || s == "/elevate";
                }
        ) == default(string)) // no -elevate option is found
    {
        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.UseShellExecute = true;
        startInfo.WorkingDirectory = 
           Environment.CurrentDirectory;
        startInfo.FileName = 
           Assembly.GetExecutingAssembly().Location;
        startInfo.Verb = "runas";
        startInfo.Arguments = "-elevate " + command;
        try
        {
            Process p = Process.Start(startInfo);
            p.WaitForExit();
        }
        catch
        {
            // System.ComponentModel.Win32Exception is thrown
            // if the user refused to run the application
            // with admin permissions; but we also guard against
            // other errors

            // just exit if there is any problem or
            // the user denied the elevation
        }
    }
}
```

So basically we start another instance of ourselves with either ‘regapp’ or ‘unregapp’ switches depending on what we want to do. We also add an ‘elevate’ flag to prevent subsequent restarts although it’s not necessary for this particular implementation of `Elevate(…)` and PVP’s `MainForm` in general.

Once again, we don’t elevate ourselves. We start another instance. So we should either wait until it’s done performing its job or might even want to communicate with it. We could also quit immediately if we are not really interested in the outcome.

But wait a second, what makes the newly spawn process run under elevated permissions? Nothing (yet). This is the key line:

```
    startInfo.Verb = "runas";
```

When we specify the ‘runas’ verb and the UAC is enabled and the process is not yet running as an Administrator the system will display a warning/message asking a user if she wants to run a process as an Administrator (if the user has enough rights to make such decisions). If the answer is ‘Yes’ the process is started with elevated permissions. If the answer is ‘No’ the new process is not started and get the `System.ComponentModel.Win32Exception`. We then may want to catch it and act appropriately.