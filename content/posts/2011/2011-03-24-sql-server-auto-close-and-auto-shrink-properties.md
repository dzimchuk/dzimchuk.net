---
title: SQL Server ‘Auto Close’ and ‘Auto Shrink’ properties
date: 2011-03-24 11:32:00
permalink: sql-server-auto-close-and-auto-shrink-properties
uuid: d40c9c12-3fec-4383-acfa-307a365a85e8
tags: Tips & Tricks
---

One day I got really annoyed by my laptop performing sluggishly. It was strange and annoying and wasn’t fun and I had no idea what was causing it. I have a lot of stuff installed for my development needs but no shitware and other pop-up-tray-assistance-wizards. And I have SQL Server Express that I use as a repository for Vault and my primary database system for my development.

So I just shrugged each time I had to wait a little more than usual, the laptop was performing well for most of the time and it does today. Although the rest of the article will be focused on SQL Server I do not make a statement that it’s a resource hog. Well it can be ![Smile](https://blogcontent.azureedge.net/wlEmoticon-smile.png "Smile") but it’s just not the point of this post.

So one day I opened up an Event Viewer in order to find details about a crashed app and guess what? I couldn’t find it! The Application log was full of messages reported by SQL Server and all of those messages were alike:

*   Starting up database 'AdventureWorks2008R2'.
*   Starting up database 'AdventureWorks2008R2'.
*   Starting up database 'AdventureWorks2008R2'.
*   ...

It went on and on and on… and what was striking is that it was reporting this message EVERY SECOND! Well, I had installed those sample databases some time ago to check something I don’t event remember what but I certainly didn’t ask for this intensive activity while I’m not watching.

My first reaction was ‘well, shit happens’ and I dropped all the AdventureWorks databases and thought I was done with that.

I wasn’t. In a few hours I went into the Event Viewer again and was red-bull-eyes’ed with:

*   Starting up database 'ReportServerTempDB'.
*   Starting up database 'ReportServerTempDB'.
*   Starting up database 'ReportServerTempDB'.
*   …

It was reporting it every 10 minutes which might have been felt like a relief but for me it was a trigger – time to do some investigation. I wasn’t going to uninstall the Reporting Services so I had to do something anyway.

Hit the Bing and you find out the problem is known and it directly relates to SQL Server ‘Auto Close’ property. Saying ‘_problem_’ is probably wrong. <u>There may be no problem at all!</u>

See, ‘Auto Close’ means that the database is ‘closed’ when a connection with the last client is closed, that is SQL Server release all the resource needed to keep the database in question running. Next time a connection is requested to this database SQL Server has to go for a heavy lifting to open it up again. This is the annoying event we see in the Event Viewer!

Why is that a problem? Or why is it not? It depends. If you got a database server you want it to be as responsive as possible. If the database is frequently accessed you want to keep it ‘hot’. Even the official [recommendation](http://technet.microsoft.com/en-us/library/bb402929.aspx) from Microsoft is to keep ‘Auto Close’ OFF in this case:

> **If a database is accessed frequently, set the AUTO_CLOSE option to OFF for the database.**

So if it’s accessed randomly the ‘Auto Close’ is the way to go. Why waste resources for nothing?

But what would you do with that activity happening each second on your laptop. YOU don’t need that. It’s understood. But what if it happens each 10 minutes? I don’t know what the Reporting Services are doing and I can live with a 10 minutes interval.

But if THAT happens on a database server – you got a problem and you’re better off switching the ‘Auto Close’ off.

## ‘Auto Shrink’

I mentioned this option too as it can also be a blessing in some situations and it can be evil in others.

It’s a trade-off between disk space and resources needed to do the shrink on one hand and, on the other hand, it’s not really a trade-off as you can disable it but still do the shrinks manually.

Official [recommendation](http://technet.microsoft.com/en-us/library/bb409862.aspx) is as follows:

> **Set the AUTO_SHRINK database option to OFF. If you know that the space that you are reclaiming will not be needed in the future, you can reclaim the space by manually shrinking the database.**

## Conclusion

There is no ultimate rule. Recommendations and factors that can influence your decision are given above. Analyze, try. For example, I got a Vault database with both ‘Auto Close’ and ‘Auto Shrink’ options ON. But it’s not bothering me with those annoying messages. It gets open when needed and closed after that. It’s not hogging my resources when I don’t work with it and I’m fine with it ![Smile](https://blogcontent.azureedge.net/wlEmoticon-smile.png "Smile").