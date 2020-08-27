---
title: ‘ProjectTypeGuids’ node in VS project files
date: 2011-04-11T09:51:00.000Z
lastmod: 2015-04-23T16:58:50.000Z
permalink: projecttypeguids-node-in-vs-project-files
uuid: 5fd0487e-dfb8-41c8-9fa2-d3b8d7b62113
tags: Tips & Tricks
---

I wanted to create a WPF resource dictionary and put it in a separate assembly for a certain purpose. I started up by creating  a regular class library and was about to add a new item to it when I was puzzled – I couldn’t find a proper template anywhere in the UI the Visual Studio provided to me. It was absent on the ‘New File’ dialog and it wasn’t there on the context menu either.

However, I knew it should be there, I’ve tried another project that was specifically created using one of the WPF templates and the items were there:

[![WPF specific items](https://blogcontent.azureedge.net/WPF%20specific%20items_thumb.png "WPF specific items")](https://blogcontent.azureedge.net/WPF%20specific%20items.png)

I tried adding WPF assemblies to my class library references (PresentationCore, PresentationFramework, System.Xaml, WindowsBase) but it didn’t make Visual Studio realize I need WPF specific items. I didn’t find a way to set it within a standard project’s settings dialog.

Then I compared the two project files (.csproj) and the only line that was interesting was:

```
<PropertyGroup>
  ...
  <ProjectTypeGuids>{60dc8134-eba5-43b8-bcc9-bb4bc16c2548};
         {FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}</ProjectTypeGuids>
  ...
</PropertyGroup>
```

On a regular class library project the ‘ProjectTypeGuids’ node was missing at all. It didn’t take long to find what those mysterious GUID’s are about: [List of known project type Guids](http://www.mztools.com/Articles/2008/MZ2008017.aspx). So the first one says it’s a WPF project and the second one says it’s a C# project.

Adding the line to the project file did the trick and I was just left wondering why it’s such a bad idea to provide appropriate UI to control project types. Not a big deal though…