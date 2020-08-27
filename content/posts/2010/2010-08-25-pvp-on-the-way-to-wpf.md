---
title: 'PVP: on the way to WPF'
date: 2010-08-25T21:49:00.000Z
lastmod: 2015-04-23T17:31:16.000Z
permalink: pvp-on-the-way-to-wpf
uuid: d916a4ca-498d-4f0d-8536-b06b820d1a87
tags: Power Video Player
---

[PVP](http://pvp.codeplex.com/) is a Windows Forms slim video and DVD player that provides a reasonable feature set for most people to play video content on their computers. It supports a skinnable user interface and relies on custom controls that draw predefined bitmaps for certain states and respond to user interactions similar to standard Windows controls. Yes, no scalable vector graphics or fancy animations, the interface was created in 2004 and hasn’t changed since then.

The idea to switch to a new presentation platform (WPF) has been hiding inside of me in a distant dark corner and is now ready to break free.

Before I start this journey I need to decide on a couple of higher level questions:

*   how deep is the change? how much should be rewritten?
*   will I be supporting 2 versions (Windows Forms and WPF) of the application?

Answers on  these questions also make an impact on the way PVP source code will be organized at CodePlex.

## Question 1

To answer this question let’s take a look at the high level component diagram that represents PVP:

[![PVP's current components (Windows Forms)](https://blogcontent.azureedge.net/pvp_current_thumb.png "PVP's current components (Windows Forms)")](https://blogcontent.azureedge.net/pvp_current.png)

Wow! Pretty modular! Let me take a moment and explain each component.

#### core

The name talks for itself. It contains the core logic to build and manipulate filter graphs, control playback, respond to various filter graph’s events (especially important when playing DVD), configure video renderers, etc, etc. In other words this is the heart of the application.

The central part of the core is a `MediaWindow` class which is per se a Windows Forms user control that is hosted inside of the main application window AND is the main interface to the business logic. The second part is not ideal, I know, and will be improved (when? read on!). But still, the main idea of the core is a media window that can be hosted anywhere. For example, you can host multiple instances of the `MediaWindow` inside some app that shows a thumbnail preview of multiple videos. Performance-wise, it was a utopia 6 years ago given an average speed of a desktop and (ha-ha!) laptop computer and in many cases it is today. But still, it opens up possibilities and is the design that will be supported.

#### dshow

The **core** gets its job done by talking to DirectShow which used to be a part of DirectX and has become a part of the core Windows SDK (or API of you like) since Windows Vista.

DirectShow is built as COM components and as you might have guessed already **dshow** is the collection of COM interop wrappers that the **core** uses. It contains definitions for interfaces, structures, etc. I built it up as I needed another interface or a type as I was adding a new feature to PVP. That is, it’s not a complete DirectShow wrapper for the .NET code. It’s just a bunch of stuff I needed (and quite a bunch so to speak).

Note, there is an awesome [DirectShow.NET](http://directshownet.sourceforge.net/) library featuring a much wider range of DirectShow functionality. The library also comes with a bunch of sample applications. However, PVP does not use DirectShow.NET.

#### nwnd

This is a native (that is unmanaged) DLL written with C++ that… what? native? C++? Urm… yeah, when you set up DirectShow video renderers they require an HWND of the window it can paint on and my experience and tests showed unpleasant performance issues when you feed them an HWND of the Windows Forms control. Seriously, it seems to work but try resizing the main window during the playback and you will see lags and other anomalies. I found that making the renderers paint on the native Win32 window that is hosted inside of the Windows Forms control really solves the problem and I believe this is the design that I will apply for the WPF version of the application.

#### pvp

This is the application itself with all the menus, dialog boxes, keyboard and mouse logic, etc. It pulls the strings of the **core** to provide the functionality that users expect from this application. This is a classical Windows Forms application. Well, not really. It uses a home-grown engine to draw a skinned interface for the main window. It actually relies on a lower level **theme** component that handles custom logic for such UI elements as windows’ borders, caption bars, etc.

#### theme

Windows (the OS, that is) has the pre-built functionality for the outer frame of a window that contains the window’s title, system menu, minimize, maximize and close buttons. It also forces the default appearance of these elements (cough, cough, I start talking in WPF terms!) that wasn’t easy to change in earlier Windows programming technologies. The best option you could probably take (and that’s what I did) was to reject those element altogether and draw everything yourself on the client area of your window. That’s exactly the job that **theme** is doing. I’m not saying this is the only and the best option but that was the best I could come up with 6 years ago. WPF changes all of that of course.

#### AdvancedUI

This is basically a custom control library that makes theming (or skinning) possible. It contains a button control that uses a set of predefined bitmap for each of the button’s state, a slider control (TrackBar) that I used for a seekbar, a control to display a notify icon (amazing but Windows Forms also contains a component for a notification icon),  it also contains some controls that I used in some of my other projects (I wrote all of the controls except for the ToolBar one).

#### napi

At last, the humble hero, the one that has the most of the references (see chart above) and the one that is nothing more than a bunch of PInvoke definitions. I was adding stuff there as I was needing it similar to **dshow**. Still, it contains a lot of frequently used stuff.

> - So, what was the first question?>  
> - What do we need to rewrite?

Apparently, **pvp**, **theme** and **AdvancedUI** projects are going away as they are totally Windows Forms based. But also (and most unfortunate) the **core** needs a refactoring as it currently contains a dependency on Windows Forms (the media window is a user control).

The following figure illustrates the first step:

[![PVP: refactoring of the core](https://blogcontent.azureedge.net/pvp_refactored_thumb.png "PVP: refactoring of the core")](https://blogcontent.azureedge.net/pvp_refactored.png)

Components in green are unchanged while those in yellow should undergo a certain level of refactoring. First off, the core should become a totally independent component. It will be responsible for interaction with DirectShow but it should not contain any logic to interact with the hosting environment.

The windows logic moves to the new **media** component which is technology dependent.

**Pvp** will require a certain update as well because it will need to interact with the **core** through a new dedicated interface instead of the media window itself.

The next step will be to replace all Windows Forms related components with WPF related ones:

[![PVP components - WPF](https://blogcontent.azureedge.net/pvp_components_wpf_thumb.png "PVP components - WPF")](https://blogcontent.azureedge.net/pvp_components_wpf.png)

Again, green ones are unchanged compared to the previous version but the yellow ones are either changed or completely new.

The **media** becomes a WPF specific element (or a control). I’m not making any concrete statements yet as the detailed technical design is still under investigation. Perhaps, it will be a `HwndHost` derived component itself, but it is not certain yet.

**Pvp** is a brand new WPF application. What are **Theme1** and **Theme2**? They are optional resource dictionaries that will contain different themes or skins. The current idea is that **pvp** should be able to dynamically detect and load available theme resource dictionaries.

## Question 2

> “will I be supporting 2 versions (Windows Forms and WPF) of the application?”

‘Support’ is not probably what you may think in this context. Well, it’s not a commercial software. What I wanted to say was whether or not I am going to release two parallel branches of the application: Windows Forms based and WPF based.

The question is valid because if you look at the architecture shown in the above charts it would be perfectly possible to keep using the same solution and the same common components and just add WPF specific ones (just give them unique names like pvp2 and media.wpf or something).

However, after some contemplation of cons and pros, if and why-nots I came to the conclusion that I don’t have resources to keep 2 products going. Common **core** can be a good thing as well as the bad one. I don’t want to limit it to .NET 2.0.

In fact, when the new thing is out who’s interested in the old one? Unless you paid for the old one which is not the case.

1.x release WILL always be available for download (both as a compiled product as well as a source branch) but the main development effort will be put into 2.x.

The trunk will always contain the **current** version, that is, **pvp** and **media** projects will turn into WPF ones soon and **theme** with **AdvancedUI** will be removed from the main branch.

1.x release may receive certain bug fixing but the new functionality will be introduced exclusively in 2.x.

Staying focused is the key.