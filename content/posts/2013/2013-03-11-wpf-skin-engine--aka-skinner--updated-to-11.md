---
title: WPF skin engine (aka Skinner) updated to 1.1
date: 2013-03-11T10:58:00.000Z
lastmod: 2015-04-22T18:44:20.000Z
permalink: wpf-skin-engine--aka-skinner--updated-to-11
uuid: b119c130-4b1e-402e-bcb6-d85337a96b9e
tags: WPF
---

The initial release of the Skinner (you can read up the details [here](WPF-skin-engine-revisited)) put a lot of effort into securing your application from loading malicious code into your main domain in full trust. It required assemblies that contained skins (in the form of BAML or just references through `SkinDescription` attributes) and all assemblies that are referenced by them (through merge dictionary pack URI links, for example, or through `SkinDescription` attributes) to be signed. It also required that you pass a public key of the key pair that was used to sign the assemblies to `SkinManagerFactory` when you requested an instance of `SkinManager`.

Moreover, skin assemblies (and assemblies they reference) should not be on the probing path of you main app domain so that the Skinner was able to intersect assembly loading mechanism and perform its checks. It’s also important to note that sub-referenced assemblies should all be on one of the paths that you pass to `SkinManager.Scan` method. They don’t have to be in the same directory, however.

Say, you have assembly A.dll with an assembly-wide attribute:

```
[assembly: SkinDescription("Shiny Red", "/Skins/ShinyRed.xaml")]
```

As you can see it references ShinyRed.xaml that’s located in Skins directory of the same assembly. Now suppose ShinyRed.xaml references another BAML in another assembly:

```
<ResourceDictionary 
  xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <ResourceDictionary.MergedDictionaries>
        <ResourceDictionary 
Source="pack://application:,,,/WpfThemes;component/ShinyRed.xaml"/>
    </ResourceDictionary.MergedDictionaries>
</ResourceDictionary>
```

You can put A.dll and WpfThemes.dll in the same directory or you can put them in separate directories. If you do the latter, make sure you pass all directories to `SkinManager.Scan` method:

```
skinManager.Scan(new[]
{
    "path to A.dll",
    "path to WpfThemes.dll"
});
```

This list of scanning directories is important at skin loading phase (as it allows `SkinManager` to find necessary assemblies), that’s why it’s returned with each `SkinDescription` object that you pass to `SkinManager` to load a skin.

Skinner performs scanning in a dedicated domain that is discarded when scanning is complete. Assemblies are loaded in reflection-only context to insure no malicious  code is executed during the scan. After an assembly is successfully checked to be signed with a specified key its hash is stored by the Skinner. This happens with all assemblies found on the paths you specified to scan.

At loading phase the Skinner verifies the hash of the to-be-loaded assembly **before** it’s actually loaded into the execution context thus preventing code from execution.

As you might have guessed this coupling of scanning and loading phases might cause problems in certain scenarios. Say, you’ve scanned for the skins and remembered user’s choice by persisting `SkinDescription` object. At the next launch of you app you want to load the skin that the user selected last time but you can’t (at least before a new scan is complete). Depending on a number of skin assemblies this could lead to undesirable delays at your app startup.

Version 1.1 addresses this issue. If it doesn’t find a hash value for an assembly in its internal store it will spawn a dedicated domain, load the assembly in question in reflection-only context of that domain, verify it’s been signed with a proper key and cache its hash for subsequent loads. Then it will try to load the assemblies into the execution context of your main domain performing all its checks.

It’s still a responsibility of the consuming application to provide a `SkinDescription` object to `SkinManager.Load` method in the same form that it received it from `SkinManager` during the scanning phase.

But version 1.1 brings on something more. It also allows you to use Skinner with all its security features turned off. It’s debatable because you’re going to load 3rd party skins you want protection against malicious code. If you’re going to load you own skins you can easily get them signed. Still, there might be other reasons…

In order to work in insecure mode you should request a `SkinManager` from `SkinManagerFactory` using a new method `GetSkinManager()` that doesn’t accept any parameters. While scanning will still be done in a dedicated domain (freeing up memory resources when it’s done) no additional checks will be performed. In this mode you can also place skin assemblies on the probing path of the main domain.

Note that you can request multiple skin managers from the factory. Each is unique per public key, that is two requests with the same public key will get equally configured skin managers (with the same internal state like assembly hashes, etc). Version 1.1 just adds a new `SkinManager` with security features turned off. While you can use multiple scan managers simultaneously you should remember that a `SkinDescription` obtained with insecure `SkinManager` may not be loaded by a secure one, while secure ones should be able to load `SkinDescription`’s of each other.