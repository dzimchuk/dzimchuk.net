---
title: Removing source control dependencies from Visual Studio project files
date: 2012-07-31 09:48:00
permalink: removing-source-control-dependencies-from-visual-studio-project-files
uuid: 79fc6674-e76b-47ff-9b1c-0bafb24230db
tags: Tips & Tricks
---

Why? Visual Studio has been providing an API that allowed 3rd party source control tools to build their SCC providers in order to integrate with it and give users a possibility to work with those tools right from IDE. It turns out to be pretty convenient especially when you and your peers use the same source control system. You can check out, undo check out, shelve, merge, commit without ever leaving IDE. 3rd party tools often provide their own UI to accomplish certain tasks.

I’ve been using [SourceGear's Vault](http://www.sourcegear.com) for almost a decade as my personal source control system. You know, every developer has a lot of stuff, be it prototypes, nice helpers, sample projects, libraries or even complete applications that he or she once worked on and all this stuff needs to be kept somewhere. No? Ok, but I kept it and Vault has been helping me a lot with it. And of course it provides its SCC (source code control) provider to integrate with VS (it actually provides 2, one called ‘classic’ and the other one ‘enhanced’ but never mind, though I’ll have to get back to it later).

So what’s wrong with it? I’ve started to notice it actually stopped being that convenient to me. For a variety of reasons:

*   I have this local database but these days I may work on multiple machines and I expect stuff to be available everywhere. Every so often I don’t want to work on that code but quickly refer to it as a reference.
*   Source control tools’ specific metadata is stored right in Visual Studio’s solution and project files and having to install Vault (in my case) on any machine is not an option. It is less critical though if you use TFS as client components have been a part of 2010 Ultimate and will be included in 2012 Pro. Yes it is possible to say ‘work temporarily without source control’ when VS asks but you again need to somehow get the files and…
*   I don’t get it why they are made read-only when checked in.
*   This one is Vault specific. I remember it was painful to open up a project set up for the enhanced client when had the classic one set as default in VS (because I happened to open up another project with it before). It can be true the other way around but I frankly don’t remember.

All in all I’ve found that VS integration gets in my way more often than it helps. I prefer to stay away from being tied to a particular source control system. Thus the need to remove metadata.

But what I would also like is a global availability which made me look in the direction of online source code hosting solutions. For a personal repository I don’t care much if it’s centralized or distributed as it’s going to be a private one and I will be the only one using it.

I’ve found 3 options:

*   [Microsoft's TFS service preview](http://tfspreview.com/). This is actually TFS in the cloud. It looks really promising and also provides project planning and tracking features (it supports agile approaches as well as more formal ones). The preview is free, however, they are not yet settled on final pricing and whether there will be any level of service available for free in the future.
*   [SourceGear's Veracity cloud storage](http://onveracity.com/). Veracity is a new DVCS built by SourceGear, you can check out the [details here](http://veracity-scm.com/) and see it has potential to kick ass of established competitors (if not already doing it). It’s native, fast, multiplatform and open sourced. The online service is free for up to 5 developers working on a project and provides agile planning and tracking vanilla. And why can’t it be used as a private repository?
*   [Bitbucket](https://bitbucket.org/) gives you free unlimited private repositories (both for Git and Mercurial). Also up to 5 users for free account as [OnVeracity](http://onveracity.com/) and project collaborations. It can be an interesting option but it will depend on my choice of source control system.

[Github](https://github.com/plans) is only free for open source which is not quite what I’m looking for now.

Ok, so removing SCC bindings from your projects is a pain in the neck when you have lots of them. You will have to open them, then unbind and save them. But if you don’t have some old provider installed you will see VS complaining and not offering you an option to remove bindings. Instead it will just offer you to open your projects ‘temporarily offline’.

So I’ve written this little tool that’s going to save your day. Just output your old stuff somewhere, remove read-only attributes recursively and run the tool passing it a root path where you’d put your stuff. The tool should be able to remove all SCC specific things but I might have missed something. Well, you have the tool, you can add what I’ve missed ![Winking smile](https://blogcontent.azureedge.net/wlEmoticon-winkingsmile.png "Winking smile")

Have a nice day!

[VSSCRemove.zip (68.32 kb)](https://blogcontent.azureedge.net/2012%2f07%2fVSSCRemove.zip)

**UPDATE: The tool is now hosted at [Github](https://github.com/dzimchuk/VSSCRemove)<a>.</a>**