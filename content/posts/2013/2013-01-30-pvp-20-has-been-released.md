---
title: PVP 2.0 has been released
date: 2013-01-30 09:01:00
permalink: pvp-20-has-been-released
uuid: aa3ec0fc-e1a9-4761-8931-79f66dd99a9f
tags: Power Video Player
---

It’s been [quite a while](PVP-on-the-way-to-WPF.aspx) since I’d planned to port PVP to WPF and in the end I’m happy to announce it has actually happened. Version 2.0 is available as always at [CodePlex](http://pvp.codeplex.com/) as an MSI distributable package as well as source code.

[![Power Video Player](https://blogcontent.azureedge.net/2013%2f01%2fpvp3d_resized.png "Power Video Player")](https://blogcontent.azureedge.net/2013%2f01%2fpvp3d_resized.png)

## The Why?

I guess it’s a valid question because there was already something that looked pretty much like it and provided nearly the same set of functionality as the new version does. So was it plainly about changing presentation platform? Yes and no. Yes, because I wanted to go away from raster graphics that suck when displayed under DPI that is different from the actual resolution of those graphics. Besides, WPF gives much more flexible and richer ways to achieve your goals with great binding support and templates.

The ‘no’ part is as important as the ‘yes’ one if not more. The legacy player was written in the days when I was enthusiastically learning Windows Forms and as a consequence its implementation might not adhere to the best design practices you might have on your mind (let’s just leave it at this ![Winking smile](https://blogcontent.azureedge.net/wlEmoticon-winkingsmile_2.png "Winking smile")).

> Note, I’m not saying there is anything wrong with Windows Forms. Instead, I’m putting the emphasis on ‘learning’.

In order to move ahead I had to do something with it but the only way out (considering the arguments I mentioned above) was a complete rewrite.

## Why not Metro?

Because you are limited to Media Foundation when building Metro Apps for Windows 8\. That’s why there is no DVD support in metro version of Windows Media Player and Microsoft suggests you install 3rd part software to play back DVDs. PVP has always been providing full DVD support and you can use it on Windows 8 (as a desktop application, of course).

## So what’s inside?

Front-end has been rewritten form scratch. I wanted to keep the original look so I spent quite some time in [Expression Blend](http://www.microsoft.com/expression/#blend) trying to reproduce the look. Yes, everything is vector even the gorgeous PVP logo on the video area! For those of you who are wondering how I reproduced the logo here’s the secrete – I used Expression Design to select portions of the old raster and turn the whole thing into XAML drawing. By the way, as indicated on [that page](http://www.microsoft.com/expression/) Expression Design and Expression Web are now available free of charge and Blend receives a new life as part of Visual Studio updates.

But WPF encourages you to go with custom themes even further. Why tolerate boring standard dialogs and controls? There is a bunch of professional WPF themes on the market but for my needs I stopped on free [Reuxables legacy collection](http://www.nukeation.com/free.aspx). It looks just right for the start.

The new app strictly complies with MVVM approach as it fits very naturally thanks to WPF’s great support for data binding. I’ve used [MVVM Light Toolkit](http://mvvmlight.codeplex.com/) to get rid of the hassle (although it’s not rocket science). I especially like the Messenger and EventToCommand extension that really help maintain decoupled architecture. Everything is glued together with [Ninject](http://www.ninject.org/).

The core stayed the same but underwent a certain adjustment. My original idea was to implement a custom EVR renderer that would help me draw on WPF surface (see my detailed report [here](Rendering-video-content-in-WPF-using-a-custom-EVR-presenter-and-D3DImage.aspx)). Unfortunately, I couldn’t achieve satisfactory results and video quality compromise was absolutely out of quiestion. So I had to retain support for native renderers (that paint on native windows) but the result is even better – you have a variety of renderers to choose from but if you follow the recommended selection you will get the best video quality possible.

Functionality-wise the new release is roughly at the same level as the old one. No, wait, now PVP supports more predefined aspect ratios and you can finally drag and drop files onto it!

There are a few new features on my mind but that’s a story for a new release. Hope you enjoy the current one and I would really appreciate your feedback!