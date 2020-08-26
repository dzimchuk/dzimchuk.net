---
title: WPF skin engine–revisited
date: 2011-10-19 04:46:00
permalink: wpf-skin-engine-revisited
uuid: a171dfe1-a1c2-40e9-a7c2-1da9ca7cad11
tags: WPF
---

**UPDATE: Version 1.1 has been released. Check out the details [here](WPF-skin-engine-(aka-Skinner)-updated-to-11).**

The [Skinner](WPF-skin-engine-part-1) library that I introduced [some time ago](WPF-skin-engine-part-1) didn’t put much care into security issues you may run into when loading and executing 3rd party components (skins). I had touched on these issues [in one of my previous posts](What-if-you-need-to-run-a-plug-in-in-full-trust) where I also gave my view on the better solution. The two major points that represent that solution are:

1.  Don’t use MEF for scanning as opposed to initial version. Not because MEF is bad, but because we need better control over the scanning process.
2.  Require strong name signing so that you could verify that skin assemblies had been signed by an authority you trust (which is you).

Both of these points did affect the way you pack your skins and the way you use the Skinner library.

## Developing a skin

A skin is a resource dictionary (or a combination of resource dictionaries) that is compiled into BAML for better runtime load times.

In order to make your skin consumable by the Skinner you need to add an assembly level attribute that defines 2 things:

1.  A friendly name of your skin;
2.  A pack Uri that should be used to load it.

Here’s an example:

```
[assembly: SkinDescription("Bureau Black", 
    "/Skins/BureauBlack.xaml")]
```

You can specify the pack Uri in one of these formats:

```
pack://application:,,,/MyAssembly;component/Skins/BureauBlue.xaml
/MyAssembly;component/Skins/BureauBlue.xaml
MyAssembly;component/Skins/BureauBlue.xaml
/Skins/BureauBlue.xamlSkins/BureauBlue.xaml
```

A skin’s resource dictionary can merge resource dictionaries from other assemblies. However, it is required that all assemblies are signed with the private key which corresponds to a public key you pass to `SkinManagerFactory` (read below).

It is also recommended that you put initial resource dictionary BAML into the same assembly that contains `SkinDescription` attribute. This is not a requirement though.

## Consuming skins with Skinner

You control the Skinner through the `ISkinManager` interface. You request `SkinManagerFactory` to provide you with a skin manager:

```
ISkinManager manager = 
   SkinManagerFactory.GetSkinManager(
      Assembly.GetExecutingAssembly().GetName().GetPublicKey());
```

As you can see the `SkinManagerFactory` accepts an array of bytes which essentially represents a public key of the key pair that was used to sign the skin’s assembly.

You are not required to sign your consuming code with the same key, The code snippet shown above just shows a possible scenario when the consuming code has been signed with the same key as skin assemblies.

The skin manager is not a singleton and you are not even required to keep a reference to it between calls. However, the factory does maintain certain state and is able to re-initialize a new instance of the skin manager properly. The state is maintained per public key as you might have guessed. This actually opens up a possibility to get multiple skin managers and have each one load skins from separate assemblies. It may not be useful in practice though.

The `ISkinManager` interface is described with the following listing:

```
/// <summary>
/// A contract for a Skin Manager.
/// Skin Manager is an entry point for a WPF application 
/// to the skinner library.
/// Through this interface it is possible to discover available 
/// skins, load and unload them.
/// 
/// The manager is expected to be called from UI thread and 
/// is not guaranteed to be thread-safe.
/// </summary>
public interface ISkinManager
{
    /// <summary>
    /// Fires when a new skin has been discovered. Applications 
    /// can subscribe to this event to receive skin descriptions 
    /// that they can use to load skins.
    /// 
    /// The event is fired on the UI thread if Application is 
    /// available.
    /// </summary>
    event EventHandler<SkinFoundEventArgs> SkinFound;

    /// <summary>
    /// Notifies a subscriber of any errors that occurred while 
    /// the scan was in progress.
    /// The error event is not fatal and doesn't abort scanning. 
    /// It's primarily for notification purpose only.
    /// 
    /// The event is fired on the UI thread if Application is 
    /// available.
    /// </summary>
    event EventHandler<ScanErrorEventArgs> ScanError;

    /// <summary>
    /// Raised when scanning is complete. A list of found skins 
    /// is included in ScanCompleteEventArgs.
    /// 
    /// The event is fired on the UI thread if Application is 
    /// available.
    /// </summary>
    event EventHandler<ScanCompleteEventArgs> ScanComplete;

    /// <summary>
    /// Scan for skins asynchronously using a separate domain.
    /// The domain will be unloaded once the scanning is finished.
    /// </summary>
    /// <param name="directories">Directories to be scanned for 
    /// skins.</param>
    void Scan(string[] directories);

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

You need to specify one or more directories for scanning. There is no convention yet, however the Skinner will refuse to scan in the probing path of your main domain. Specifically, it will check that provided paths don’t included `AppDomain.CurrentDomain.SetupInformation.ApplicationBase` and any of the directories from `AppDomain.CurrentDomain.SetupInformation.PrivateBinPath`. If there is any of these directories, the scanning will abort with `ProhibitedPathException`. It is not thrown to the consuming code though (read below).

The reason to exclude directories on the probing paths is to intersect the assembly resolving mechanism when loading skins and provide additional security checks on the requested assemblies (see my [post](What-if-you-need-to-run-a-plug-in-in-full-trust.aspx) for more details).

It is recommended that you pass `SkinDescription` instances to the Load method that have been retrieved during scanning. And it is required that a `SkinDescription` instance contains a list of directories used to scan for skins. Otherwise, the assembly resolving mechanism may fail.

## Custom errors

There are a few custom exceptions that the Skinner may yield during scanning and loading. Exceptions that happen during the scanning pass are not directly propagated to the caller. Instead, you need to subscribe to `ScanError` event before scanning to receive information about errors. They include `ProhibitedPathException` and in fact any other exception FCL.

Exceptions that occur when loading/unloading skins are propagated to the caller. Make sure you properly handle them. They include `LoadSkinException` and `UnloadSkinException`.

## Where to get it

Skinner is available as a NuGet package. You can look it up in the NuGet gallery or you can just type the following command in the Package Manager Console:

```
Install-Package Skinner

```

The library targets .NET 4.0.