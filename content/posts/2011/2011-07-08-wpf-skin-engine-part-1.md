---
title: WPF skin engine – part 1
date: 2011-07-08 06:13:00
permalink: wpf-skin-engine-part-1
uuid: 4b4b3168-99b7-4938-9619-a89fc341d731
tags: WPF
---

**NOTE: The information presented in this post is outdated. It does describes the problem the library tries to solve but the approach in which this is done has changed. For the current library description please visit [WPF skin engine - revisited](WPF-skin-engine-revisited).**

In the upcoming couple of posts I’m going to a cover a simple yet useful helper library I wrote recently. Its purpose is to provide a convenient way to manage skinned interface in an application that wants to support various skins and a possibility to change them at runtime. WPF has all that’s needed to apply a different look to everything from a thumb on a track bar to the whole window but it’s still a programmer’s task to implement the logic needed to look for available skins, load, apply and unload them. This library called **Skinner** solves this task and allows you to jump right to actually creating art work (XAML templates) and/or great functionality of your application without bothering about the tedious details of managing skins.

When I started working on it I outlined a few of the core requirements:

*   It should be simple, that is dead-simple to use;
*   Scanning for available skins should be efficient, that is fast and not hurting the application;
*   It should be able to enable a chosen skin, disabling the previous one if there was any;
*   Loading a skin should be fast, it’s extremely important for the start-up time.

What is a skin? By the way, I’d love to use the term ‘theme’ instead but in WPF world it’s already used to refer to OS themes support (Luna, Aero). So not to cause a conclusion I stopped on ‘skin’.

So what is a skin? Effectively a resource dictionary containing a bunch of templates to define the look of various UI elements.

But keeping your skins in XAML is not efficient in terms of performance as parsing them will severely affect loading time. If you struggle to keep your application’s start-up time as little as possible, parsing XAML will hurt too bad. So we want to compile our skins into BAML and put it in an assembly as a resource.

Now that we have decided on what a skin physically represents, we can decide how to find and load it.

Skinner uses MEF for scanning purposes. It appears to be extremely fast. Moreover, as potentially there can be a lot of third party skins provided for your application (and these skins are .NET assemblies containing BAML resources) you wouldn’t want to load them all in your process during the scan as these assemblies can’t be unloaded unless you load them in a separate domain that you can unload. Thus, Skinner will create a domain for scanning purposes and shut it down when finished scanning.

And of course, scanning for new skins is not something your application should be doing in the foreground. It needs to start, load the currently selected skin and start a background search for new skins. Skinner takes care of that too.

## Developing a skin

First, you need XAML. I’m going to use one of the [freely available](http://wpf.codeplex.com/wikipage?title=WPF%20Themes&ProjectName=wpf) themes and just reference it in my skin’s resource dictionary:

```
<ResourceDictionary 
  xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <ResourceDictionary.MergedDictionaries>
        <ResourceDictionary 
Source="pack://application:,,,/WpfThemes;component/BureauBlue.xaml" />
    </ResourceDictionary.MergedDictionaries>
</ResourceDictionary>
```

I also need a bit of metadata for the Skinner library which is basically the name of my skin (something you want to display to the user) and a pack Uri that Skinner will use to load this skin.

The metadata is defined for each skin in a class called `SkinDescription`. Skinner expects a a MEF-exportable class that implements `ISkin` interface to be defined for each skin. `ISkin` interface defines just one method:

```
/// <summary>
/// A contract that represents a skin.
/// </summary>
public interface ISkin
{
    /// <summary>
    /// Get the description of the skin.
    /// </summary>
    /// <returns>Description of the skin.</returns>
    SkinDescription GetDescription();
}
```

Thus, this is all the code needed to define your skin:

```
[Export(typeof(ISkin))]
public class BureauBlue : ISkin
{
    public SkinDescription GetDescription()
    {
        return new SkinDescription("Bureau Blue", 
            new Uri("/Skins/BureauBlue.xaml", UriKind.Relative));
    }
}
```

Here’s an interesting thing – the URI is defined relatively to the skin’s assembly. This is because `Uri` class’ constructor won’t happily accept an absolute pack Uri (sighs…). But how are we going to load a resource with a relative Uri like this? It doesn’t even mention the assembly name… Don’t worry, Skinner will take care of this too. In fact, it supports all these forms:

```
pack://application:,,,/MyAssembly;component/Skins/BureauBlue.xaml
/MyAssembly;component/Skins/BureauBlue.xaml
MyAssembly;component/Skins/BureauBlue.xaml
/Skins/BureauBlue.xaml
Skins/BureauBlue.xaml
```

However, as I mentioned, you probably won’t be able to create a `Uri` object with an absolute pack Uri.

## Consuming skins with Skinner

You control Skinner with a skin manager. Skin manager is a class that implements (guess what?) `ISkinManager` interface. Skinner provides a default implementation for you, which a singleton and should be requested through `SkinManagerFactory`:

```
ISkinManager manager = SkinManagerFactory.GetSkinManager();
```

It insures there is only one instance of skin manager in your application as it keeps track of what skin is currently loaded.

Let me post the I`SkinManager` interface in its entirety:

```
/// <summary>
/// A contract for a Skin Manager.
/// Skin Manager is an entry point for a WPF application 
/// to the skinner library.
/// Through this interface it is possible to discover available 
/// skins, load and unload them.
/// 
/// The manager is expected to be called from UI thread 
/// and is not guaranteed to be thread-safe.
/// </summary>
public interface ISkinManager
{
    /// <summary>
    /// Fires when a new skin has been discovered. 
    /// Applications should subscribe to this event 
    /// to receive skin descriptions that they can use 
    /// to load skins.
    /// 
    /// The event is fired on the UI thread if Application 
    /// is available.
    /// </summary>
    event EventHandler<SkinFoundEventArgs> SkinFound;

    /// <summary>
    /// Notifies a subscriber of any errors that occured while 
    /// the scan was in progress.
    /// The error event is not fatal and doesn't abort scanning.
    /// It's primarily for notification purpose only.
    /// </summary>
    event EventHandler<ScanErrorEventArgs> ScanError;

    /// <summary>
    /// Scan for skins asynchronously using a separate domain.
    /// The domain will be unloaded once the scanning is 
    /// finished.
    /// </summary>
    void Scan();

    /// <summary>
    /// Load a skin.
    /// If there is a previously loaded skin it will be unloaded
    /// first.
    /// </summary>
    /// <param name="skinDescription">A description of the skin 
    /// to load.</param>
    void Load(SkinDescription skinDescription);

    /// <summary>
    /// Unload a skin that has been loaded with 
    /// Load(SkinDescription) before.
    /// If no skin has been loaded, the method does nothing.
    /// </summary>
    void UnloadCurrentSkin();
}
```

I’ve tried to document it as well as I could. I believe it’s simple enough to meet my first requirement, isn’t it? At the end of this post you will find a link to a solution containing test projects as well as the Skinner library itself (licensed under MS-PL) so you could try it in action.

## Scanning performance

One thing that’s not yet been covered is performance. The attached solution contains ConsoleTestApp project that tests scanning performance. It runs Skinner against 202 skin assemblies and Skinner finishes scanning in about 1.6-2 seconds.

As to the loading performance you can check the provided WPF test project (there must be a running WPF application so that the skin can be merged into its resource dictionary).

Loading a skin from another assembly and applying it takes around 80 ms on my machine. Loading it for the 2nd time takes around 20-30 ms. Why? Because when you load a skin, the assembly is loaded into your main application’s domain. That’s the only way I could properly manage to load BAML. For details, have a look of part 2 of this post that’s coming soon.