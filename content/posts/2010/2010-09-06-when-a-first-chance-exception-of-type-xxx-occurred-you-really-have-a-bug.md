---
title: When a first chance exception of type 'XXX' occurred you really have a bug
date: 2010-09-06 06:20:00
permalink: when-a-first-chance-exception-of-type-xxx-occurred-you-really-have-a-bug
uuid: 8cc4ddce-80c3-4ddb-a50b-574878ab64a3
tags: Tips & Tricks
---

So you see this message about a first chance exception in your debugger’s output window, your brows rise, you glance through the code back and forth and can’t see a thing. What’s more, your application runs just fine and the exception doesn’t manifest itself in any way rather than this annoying debugging output. You shrug and… Stop! You got a bug. Whatever you’ve been doing – just put it off and fix your code before moving on.

I got this message in my output window too:

> A first chance exception of type 'System.NullReferenceException' occurred in core.adapter.dll.

This is one of the components of my application and despite the fact that exception was thrown the application continued to function just fine. I understood that it was just probably caught somewhere else in my application code (otherwise it would have taken it down) but the debugger was kind enough to notify me that there was something wrong.

To find the place where the exception originated I modified Visual Studio’s exception rules (Debug –> Exceptions):

[![Exceptions dialog of the VS debugger](https://blogcontent.azureedge.net/exceptions_dlg_thumb.png "image")](https://blogcontent.azureedge.net/exceptions_dlg.png) 

See by default during the debugging session Visual Studio will break the execution when your application code doesn’t catch an exception. But we also can make it break at the time the exception gets thrown.

This change easily revealed the spot:

```
public bool ShowLogo
{
    get { return _showLogo; }
    set
    {
        _showLogo = value;
        _mediaWindow.Invalidate();
    }
}
```

The `_mediaWindow` private member just wasn’t instantiated yet when something accessed that setter. And that ‘something’ happened to be in the main component of my application that was loading user preferences on startup. Here’s the sketchy code:

```
protected void LoadSettings()
{
    IsolatedStorageFileStream stream = null;
    try
    {
        IsolatedStorageFile storage =
            IsolatedStorageFile.GetUserStoreForAssembly();
        string[] astr = storage.GetFileNames(strConfig);
        if (astr.Length > 0)
        {
            stream = new IsolatedStorageFileStream(strConfig, 
                FileMode.Open, FileAccess.Read, 
                FileShare.Read, storage);

            PropertyBag props = new PropertyBag(stream);
            LoadSettings(props);
        }
    }
    catch(Exception e)
    {
        LogIt(e);
    }
    finally
    {
        if (stream != null)
            stream.Close();
    }
}

protected void LoadSettings(PropertyBag props)
{
    ...
    ...
    mediaWindowHost.ShowLogo = 
        props.Get<bool>("show_logo", true);
    ...
}
```

As you can see there is a pretty general catch block whose primary purpose is to protect against IO errors. However, it also swallowed the `System.NullReferenceException.`

This single example discovered a few potentially dangerous places in my code and raised a bunch of questions:

1.  Why wasn’t `_mediaWindow` private member initialized by the time the `ShowLogo` setter was called? Should I reconsider the way the `_mediaWindow` gets initialized or is it enough to just check for null in the setter?
2.  When the exception was thrown the settings loading procedure was interrupted. That means all settings that were supposed to be loaded after the logo one were abandoned. And this is actually a deviation from the normal program behavior that was just not noticed.
3.  If I make the exception handling more specific (which is always a better choice) should I expect other problems when loading settings (type casts, for instance)?

I’m going to find my way through these questions anyway but the moral of story doesn’t change: never ignore the debugger output.