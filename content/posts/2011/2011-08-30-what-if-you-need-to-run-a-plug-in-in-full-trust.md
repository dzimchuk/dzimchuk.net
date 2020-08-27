---
title: What if you need to run a plug-in in full trust?
date: 2011-08-30T09:41:00.000Z
lastmod: 2015-04-23T16:53:36.000Z
permalink: what-if-you-need-to-run-a-plug-in-in-full-trust
uuid: cb07b0dd-094b-411a-8c98-e2d30039cc56
tags: .NET
---

In my initial scratch of the [Skinner](WPF-skin-engine-part-1) I unwillingly ignored the security issues and the resulting code is only going to work in a full trust environment. There are few things that raise a security concern:

*   we need to scan for available skins in arbitrary directories (initial version of Skinner used MEF to do the job);
*   as we require a skin to implement `ISkin` interface we will have to call `ISkin.GetSkinDescription()` that gives the 3rd party code a chance to run any logic it has (if we don’t care to build up sufficient restrictions);
*   when it comes to actually loading a skin (which is a compiled resource dictionary) we have to do it in the main application domain (I had [already mentioned](WPF-skin-engine-part-2) there is no way you can load BAML in one domain and pass the resulting object graph to another);

The first 2 bullets can be tackled: we can created a sandboxed domain and do the scanning there. It can get a little tricky though because if a plugin has to implement an interface you provide you have to make sure your assembly that contains this interface can be loadable from the sandboxed domain. The first thing you can do is to give `FileIOPermission` to the assembly file when creating the domain. However, if the new domain’s `ApplicationBase` is not set to point to the directory containing your assembly, the resolution is going to fail. And there is no way to subscribe to `AppDomain.AssemblyResolve` event from within the sandboxed domain because it requires the code to be executed in full trust.

We still can set the sandboxed domain’s `ApplicationBase` to point to  the directory containing your assembly but we may well run into trouble loading our supposed-to-be full trust assembly in the sandboxed environment. To work around this we can isolate the public interfaces that are necessary for a plugin’s (a skin’s) implementation into a separate assembly and mark it as `SecurityTransparent` (assuming .NET 4 model is in use). Giving `FileIOPermission` to that ‘secure’ assembly only will help, however I had subsequent problems when trying to go that path with my Skinner library.

## The third bullet

I could continue to push further with scanning however the 3rd bullet kept sticking before my eyes. If you have to load a 3rd party skin in your main domain you’re looking for trouble. This is XAML, it can instantiate any object and  that object can contain malicious code directly executable from its constructor.

In this situation you have to know what you’re loading upfront. ‘Knowing’ means you trust the plugin and there are ways you can validate they deserve your trust:

*   Use regular strong name signing
*   Use authority-based signing (Authenticode)

With Authenticode signing you can say that the publisher is the one who he’s trying to pass for. That is, John Smith is confirmed to be John Smith by a party you trust (your mom) and in you have a note in your records that you trust John Smith. When these two facts come true you can relax and say ‘This is my old buddy John, I can let him in’. It has two implications: 1 (for you) you have to know the parties being signed; 2 (for plugin creators) they have to pay some respected authority to give them recognition (certificate) you can verify.

With strong naming you take the responsibility of that ‘well respected authority’. That means that you actually sign plugins with your private key. No one else can sign them. You only load and execute plugins signed with your key. In this scenario plugin creators will have to submit their built work to you to sign.

The one you choose is really dependent on your situation but in my situation I prefer the strong name signing. It would be completely great if I could load skins from unknown authors but it just can’t be done in a sober mind under full trust.

## Strong name verification

It’s really easy when you sign your application (or plugin consuming library) with the same key you sign plugins.

> You can choose a strategy you like (one key for all apps, a separate key for an app. a separate key for a lib). It just depends on the level you’re ready to make your life harder ![Smile](https://blogcontent.azureedge.net/wlEmoticon-smile_1.png "Smile") .

Then you can come up with an extension method like this:

```
public static bool IsSignedWithSameKeyAs(this Assembly assembly, 
    Assembly anotherAssembly)
{
    bool ret = false;

    var thisAssemblyKey = assembly.GetName().GetPublicKey();
    var anotherAssemblyKey = assembly.GetName().GetPublicKey();

    if (thisAssemblyKey != null && 
        thisAssemblyKey.Any() && 
        anotherAssemblyKey != null && 
        anotherAssemblyKey.Any() &&
        thisAssemblyKey.Length == anotherAssemblyKey.Length)
    {
        ret = true;

        for (int i = 0; i < thisAssemblyKey.Length; i++)
        {
            if (thisAssemblyKey[i] != anotherAssemblyKey[i])
            {
                ret = false;
                break;
            }
        }
    }

    return ret;
}
```

It is obvious that you should perform this check before running any code from a plugin assembly. However, if you loaded an assembly and it failed the check there is no way to unload it. To solve this issue you have to have some kind of a pre-loading mechanism. For instance, in Skinner there is a scanning operation that is done in a dedicated sandboxed domain which is unloaded once the scanning is finished. The actual check for a strong name signature should happen there.

However, how can we guarantee that the assembly hasn’t been substituted between scanning and the subsequent loading for consumption? A possible solution could be generation of the unique hash over the assembly file during the scanning pass after the strong name validation has been successful and keeping that hash value in memory in, for example, a dictionary that would map an assembly’s filename to the generated hash value.

When it comes to loading the plugin for execution (in full trust) don’t just load the assembly. First, load the file as a byte array and generate the hash. Then verify if it matches the one you generated for that particular file during the scanning pass.

There is one more thing to take care about. When loading a plugin it can dynamically load other assemblies. For instance, a resource dictionary can define merge directionaries from other assemblies. To be on the safe side you want to perform the same check on other assemblies as well. But how would you determine which will get loaded? `AppDomain` has a property called `IsFullyTrusted` that makes it possible for a plugin to determine if it's running within restriced permissions and adjust its behavior appropriately. On the other hand, if you signed the plugin you probably went though a certain review procedure. See, there is room for discussion but make sure the review is thorough. Once the 3rd party code becomes fully trusted you have no means to restrict it. Yes you can put the plugins in a separate location so they won't be able to automatically load assemblies from your probing directories. You could then perform described above verification in `AppDomain.AssemblyResolve` event handler, but what if the plugin tries and loads another assembly through reflection? And it can be smart enough to guess the file location.

Again, this may not be relevant to most plugins that need to perform some logic. You will run them in the sandboxed domain and be certain they won't do what you didn't allow them to do. But there are special kinds of plugins (like WPF skins) that you will have to execute in full trust. And before you give them your trust you will have to carefully varify them before they can even start being consumable by your application.

## What about MEF?

Use it when you know what you’re loading. But watch out! When an assembly is loaded with reflection (which is what MEF does, of course) it will get loaded regardless of whether it was signed or not. And even if you load your imports as `Lazy<>` the moment you access their `.Value` property their constructors get executed. And, ironically, you have to instantiate them in order to access the `Assembly` object to inspect if it was signed but it happens to be too late.