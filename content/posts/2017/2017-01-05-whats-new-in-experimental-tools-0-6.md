---
title: What's new in Experimental Tools 0.6
date: 2017-01-05 07:44:00
permalink: whats-new-in-experimental-tools-0-6
excerpt: It's been a couple of months since I introduced Experimental Tools extension for Visual Studio 2015 and above. While the 2017 version is being cooked and I've decided to make a quick tour of the features that have been added to it over this time.
uuid: 4f2fb724-e8df-4274-9280-0ca7b1f95c44
tags: Experimental Tools
---

It's been a couple of months since I introduced [Experimental Tools](https://marketplace.visualstudio.com/items?itemName=AndreiDzimchuk.ExperimentalTools) extension for Visual Studio 2015 and above. While the 2017 version is being cooked and I've decided to make a quick tour of the features that have been added to it over this time.

First of all, there are a couple of features that help you organize files within your projects:

* Update file name to match type name (and vice versa)
* Namespace does not match file path analyzer

The extension provides an analyzer that checks if a top level type name does not match the name of the file where it is declared and displays a warning:

![Type and file name analyzer](https://blogcontent.azureedge.net/2016/12/TypeAndDocumentNameAnalyzer.png)

It also offers to either rename the type to match the file name or rename the file to match the type name.

![Type and file name analyzer](https://blogcontent.azureedge.net/2016/12/TypeAndDocumentNameCodeFix.png)

Please note that Visual Studio 2017 provides the same code fixes out of the box so they will be disabled when running inside 2017. However, the analyzer will still work and will enable you to quickly locate places where if you have inconsistencies.

By the way, you haven't already, I recommend that you try out the 'Solution Error Visualizer' feature of the [Productivity Power Tools](https://marketplace.visualstudio.com/items?itemName=VisualStudioProductTeam.ProductivityPowerTools2015) extension. With this feature enabled you can quickly glance at and navigate to analysis issues of Error and Warning severity throughout the solution.

Experimental Tools also give an analyzer that checks if a top level namespace matches the path of the file where it is declared and displays a warning if not:

![Namespace and file path analyzer](https://blogcontent.azureedge.net/2016/12/NamespaceNormalizationAnalyzer.png)

It assumes assembly name as the root namespace as it's currently problematic to get the default namespace from within analyzers. At the moment it's the analyzer only feature but the code fix is definitely on the [road map](https://github.com/dzimchuk/experimental-tools/blob/master/CHANGELOG.md).

Often when you're refactoring and moving code around you find yourself pasting code from existing types into new types. I hope you're going like this little time saver when this code includes a constructor:

![Make it a constructor](https://blogcontent.azureedge.net/2016/12/MakeItConstructorCodeFix.png)

It actually reacts to the standard [CS1520](https://msdn.microsoft.com/en-us/library/ecw87y92(v=vs.140).aspx) compiler error that gets registered for all methods that don't have a return type. If there is no constructor with the same set of parameters the extension will offer you to turn the offending method into a constructor.

There is a standard command in Solution Explorer called 'Sync with Active Document'. People coming from [ReSharper](https://www.jetbrains.com/resharper/) will appreciate its equivalent:

![Locate in Solution Explorer](https://blogcontent.azureedge.net/2016/12/LocateInSolutionExplorerCommand.png)

The command is available in the code editor either from the context menu or as a familiar Shift+Alt+L shortcut.

If you're a fan of [xUnit](http://xunit.github.io/) data driven tests this one's going to be a little time saver for you. You can scaffold `MemberData`:

![Scaffold xUnit MemberData](https://blogcontent.azureedge.net/2016/12/ScaffoldXunitMemberData.png)

As well as `InlineData`:

![Scaffold xUnit MemberData](https://blogcontent.azureedge.net/2016/12/ScaffoldXunitInlineData.png)

If your `InlineData` contains acceptable parameters they will be respected unless the test method already defines parameters (in which case neither of the scaffolding refactoring will work).

Note that this feature works with xUnit 2.x only.

I totally realize that folks have their own preferences and may not like certain features. That's why all them can be individually turned on or off:

![Type and file name analyzer](https://blogcontent.azureedge.net/2016/12/GeneralOptions.png)

I guess this is it for now. [Download](https://marketplace.visualstudio.com/items?itemName=AndreiDzimchuk.ExperimentalTools) the extension and give it a try, [report](https://github.com/dzimchuk/experimental-tools/blob/master/ISSUE_TEMPLATE.md) issues if you find any and if you have ideas you're welcome to [contribute](https://github.com/dzimchuk/experimental-tools/blob/master/CONTRIBUTING.md) (or write your own extension, it's fun, I promise)!