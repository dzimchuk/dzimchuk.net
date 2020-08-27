---
title: Play nice with LAV filters when rendering DVD
date: 2013-08-01T08:58:00.000Z
lastmod: 2015-04-22T18:43:10.000Z
permalink: play-nice-with-lav-filters-when-rendering-dvd
uuid: c1399190-5cac-45a3-8192-65cb24fe5b0a
tags: Power Video Player, DirectShow
---

If you’ve used [Power Video Player](http://pvp.codeplex.com/) you probably know that current version relies on 3rd party decoders that are present on user’s system. These decoders are actually DirectShow filters and PVP’s ability to render certain types of content depends on what exact filters users have registered on their system. But mere presence of filters doesn’t guarantee they will be used by the player. As of now PVP still heavily relies on what is known ‘[intelligent connect](http://msdn.microsoft.com/en-us/library/windows/desktop/dd390342(v=vs.85).aspx)’ which is a feature of DirectShow’s graph builder components that allows to automatically search for necessary intermediate filters to render particular types of content. Registered filters declare what kind of major media types and subtypes they are capable of processing but what’s important is there is a concept of a ‘merit’ which sort of prioritizes filters for intelligent connect algorithm.

I’ve noticed a few problems with PVP when running on systems that have [LAV filters](http://code.google.com/p/lavfilters/) installed. They can be installed as part of popular code packs or as stand-alone components.

> I would like to underline that I’m talking about problems of PVP which can be called defects if you like. These is nothing wrong with LAV filters which in fact seem to deliver great functionality and quality. It’s just that PVP is unable to use them properly… yet.

In this post I want to talk about one single issue when PVP is unable to playback DVD because video steam is not rendered while a system clearly has all the necessary decoders to choose from.

Here’s what a filter graph looks like:

[![DVD filter graph with unrendered video and subpicture streams](https://blogcontent.azureedge.net/dvd_lav_thumb.png "DVD filter graph with unrendered video and subpicture streams")](https://blogcontent.azureedge.net/dvd_lav.png)

As you can see DVD graph builder picked up LAV Video Decoder to decode video stream however it couldn’t connect it to the render (and this case this Enhanced Video Renderer that PVP flags as preferred on systems running Windows Vista and above). What’s really strange here is that there is no obstacle to render decoder’s output (NV12) by EVR:

[![Output video format of LAV Video Decoder](https://blogcontent.azureedge.net/pvp_lav_video_thumb.png "Output video format of LAV Video Decoder")](https://blogcontent.azureedge.net/pvp_lav_video.png)

Inability to render a video stream is fatal when trying to play DVDs. Other streams can be ignored but it clearly makes no sense without video.

One other issue with this graph is unrendered subpicture stream. It may seem as a minor issue but I was surprised that connecting DVD Navigator’s output subpicture pin to LAV’s input one using intelligent connect also fixes up the video stream that gets happily connected to the renderer. There can be a quirk in the automatic algorithm because this graph looks a bit different from the ones I’ve usually seen before, for example:

[![DVD filter grpah when using Microsoft's decoder](https://blogcontent.azureedge.net/dvd_ms_thumb.png "DVD filter grpah when using Microsoft's decoder")](https://blogcontent.azureedge.net/dvd_ms.png)

I’ve substituted LAV Video Decoder with Microsoft’s DTV-DVD Video decoder and ships with Windows Vista and above and now I see a familiar picture. What’s different is a subpicture stream from the source filter (subtype DVD_SUBPICTURE) gets transformed to a AI44 stream by the video decoder that gets eventually connected to the video renderer. The video renderer then merges this stream with the video stream.

LAV Video decoder seems to be doing it all itself, that is, a video renderer gets a final merged video stream. This somehow confused a graph builder.

PVP now handles the situation you see in the first graph by trying to connect unrendered streams. The fix is available in version 2.0.4960.