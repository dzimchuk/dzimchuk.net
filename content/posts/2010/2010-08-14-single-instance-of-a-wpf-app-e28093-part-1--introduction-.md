---
title: Single instance of a WPF app – part 1 (introduction)
date: 2010-08-14 00:26:00
permalink: single-instance-of-a-wpf-app-e28093-part-1--introduction-
uuid: 67bc1e3c-1d09-4599-a432-8481c6344de1
tags: WPF
---

Running your application as a single instance on a machine is not something that is supported by WPF out of the box (as per version 4) but sometimes a desirable and at other times even a showstopper feature.

When it comes to single instancing two requirements pop up in mind:

1.  Only one instance of an application should be running on a machine at a time.
2.  When other instances are launched they must communicate command line arguments to the already running instance so the latter could act appropriately (depends on an application in question). Once it has communicated its argument a duplicate instance shuts down.

There could be other nuances but these 2 are the core ones. No wait! There is the 3rd one which is explained below.

The 1st requirement is usually achieved with a help of mutex which is a kernel level synchronization object. When you create (or obtain) a named mutex you become an owner of it. When another process obtains a mutex with the same name it is denied the ownership but still is given a handle it could use for synchronization purposes.

The 2nd requirement involves inter-process communication and there are options. As a developer of a WPF application you can:

*   use WCF or Remoting (the first ones that come to mind, ain’t they?)
*   perhaps prefer a lower level socket communication or named pipes directly
*   use exotic home grown file-based or database-based or whatnot mechanism
*   WM_COPYDATA

Not sure if I’ve covered all of them and I don’t make any statement about their priority. That’s why I didn’t number them but instead used bullets :)

Well, here comes the 3rd requirement:

> The communication must be fast.

Perhaps I’m biased and of course I judge from a perspective of a video player application but I think passing a few command arguments must be lightening fast. When I’m playing a movie and click on another file in the Windows Explorer I want my player to switch to playing the new file right off the bat. The more delay the more angry I get.

I’m not going to invent a file-based or database-based mechanism. It’s completely irrelevant for the task (given the 3rd requirement and it’s going to be overkill anyway). There is one interesting mechanism involving `Microsoft.VisualBasic.ApplicationServices.WindowsFormsApplicationBase` class. Probably I’ll have a look at it as well.

I don’t want to involve TCP because finding a vacant port and letting other instances know where to connect to adds unnecessary complexity to the design.

What I’m going to cover in the upcoming posts are (in the order of priority now):

1.  WM_COPYDATA – a great mechanism I first learned from the [Joseph M. Newcomer's](http://www.flounder.com/nomultiples.htm) excellent assay. I’ve used it in [PVP](http://pvp.codeplex.com/) since 2004 or 2003 and it proved its value over years.
2.  A WCF mechanism. Looking at the list of options above I think named pipes over WCF should be sweet.

Do you know of other mechanisms? Please share your experience!

Otherwise follow me:

*   [part 2 (WM_COPYDATA)](Single-instance-of-a-WPF-app-e28093-part-2-(WM_COPYDATA))
*   [part 3 (WCF)](Single-instance-of-a-WPF-app-e28093-part-3-(WCF))
*   [part 4 (WindowsFormsApplicationBase)](Single-instance-of-a-WPF-app-e28093-part-4-(WindowsFormsApplicationBase))
*   [part 5 (Remoting)](Single-instance-of-a-WPF-app-e28093-part-5-(Remoting))