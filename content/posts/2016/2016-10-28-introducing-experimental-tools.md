---
title: Introducing Experimental Tools
date: 2016-10-28 14:27:00
permalink: introducing-experimental-tools
excerpt: Recently I've started working on a new pet project called Experimental Tools. The idea is to build a Visual Studio extension that provides a number of useful refactorings, code analyzers and fixes that make our everyday work more enjoyable by removing common chores when writing code.
uuid: c8bef6df-1f8f-4be7-8173-db6955f9ee7e
tags: Experimental Tools
---

Recently I've started working on a new pet project called [Experimental Tools](https://visualstudiogallery.msdn.microsoft.com/8ea7527b-98c9-4571-a43d-0b4851a010c3) (ET). The idea is to build a Visual Studio extension that provides a number of useful refactorings, code analyzers and fixes that make our everyday work more enjoyable by removing common chores when writing code. There are plenty of options already available, some paid ones and some free. The latter started coming after the .NET Compiler Platform (aka Roslyn) had been rolled out with the release of VS 2015. Why bother then?

Well, you know, I have my own vision on productivity tools and what they should bring to the table. First of all, Visual Studio is evolving and we see more features coming. I don't want a tool to replace what already works well out of the box. And if you haven't already I suggest you take some time to read about some [Visual Studio hidden gems](https://blogs.msdn.microsoft.com/visualstudio/2016/07/29/visual-studio-hidden-gems/). I bet you're gonna find at least one you didn't know about. Lots of new and missing functionality is coming with new releases of Visual Studio. For example, in '15' we're going to have a [move type to file](https://blogs.msdn.microsoft.com/visualstudio/2016/10/05/announcing-visual-studio-15-preview-5/) refactoring. High time!

I'm also not a fan of feature bloat. Yes, different people need different things, that's understood. But over the years I've come up with a list of what I consider essential functionality that I would expect from an IDE. And I've got a list of things that I'm missing from the barebones VS. You can check out the [change log and roadmap of ET](https://github.com/dzimchuk/experimental-tools/blob/master/CHANGELOG.md) to get an idea of it. The list is not complete and I certainly don't expect it to be sufficient for everyone but it's a start.

Also, Microsoft has gained pace releasing its products and services frequently. This is a common thing that's happening throughout the industry. You can't afford long release cycles to stay relevant anymore and instead you want to do incremental releases and evolve your product based on the reaction of your target audience. As developers we don't want to find ourselves crippled because our favorite productivity tool does not support .NET Core projects or C# 7 or whatnot coming tomorrow and stands in our way with irrelevant suggestions. You know what I mean?

And finally, and most importantly, it's just a lot of fun! I'm thrilled about the possibilities that the .NET Compiler Platform opened and the idea that we can add whatever feature we need and it doesn't seem to take tremendous effort.

## Experimental Tools

Enough about why. So what do we got?

As of version 0.2 there are 4 refactorings:

- Initialize field from constructor parameter 
- Add constructor and initialize field 
- Initialize field in existing constructor 
- Change access modifier on type declaration

The first 3 ones are built around the constructor functionality and are there to improve your experience when you do dependency injection. You can declare a field and have it initialized in an existing constructor or you can have a new constructor added for the field. It works the other way around too. When you have a constructor parameter and it hasn't been used to initialize a field yet you can have a new field declared and initialized for you.

![Add new constructor and initialize field refactoring](https://blogcontent.azureedge.net/AddConstructorAndInitializeField.png)

The type access modifier changer may not at the same level of usefulness but it's a very common usage pattern when you add a new type and you have a policy of declaring explicit access modifiers. By default Visual Studio's template creates types with default implicit modifiers. Yes, you can create your own templates but I prefer to just Ctrl.+ on a declaration and select an option I need:

![Change type access modifier refactoring](https://blogcontent.azureedge.net/ChangeTypeAccessModifier.png)

If that sounds interesting you can download the extension from [the galley]((https://visualstudiogallery.msdn.microsoft.com/8ea7527b-98c9-4571-a43d-0b4851a010c3)) or install it from VS. Don't hesitate to leave a feedback! The extension is going to auto-update itself as I publish new versions. You can also check out [the code](https://github.com/dzimchuk/experimental-tools) and of course contributions are welcome!