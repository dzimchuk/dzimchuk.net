---
title: JVM 6 and Minsk time zone
date: 2012-09-26T11:42:00.000Z
lastmod: 2015-04-22T18:51:29.000Z
permalink: jvm-6-and-minsk-time-zone
uuid: 1ea09d7e-16e2-4b1b-bfda-dba6a26f7d16
tags: Tips & Tricks
---

I lost some time today… No, I’ve lost shit load of time today figuring out why my fresh installation of TeamCity doesn’t respect the time zone setting on my server. The server is configured for my local time zone (Minsk) as any other machine in our network but TeamCity kept insisting that the server time zone was America/Caracas (eek!). Well I can do the math and schedule a nightly build anyway but the whole situation was too absurd to ignore.

As a warm-up I had searched all over the web interface in hope there was that magic option. No way, but on the Agent Parameters/System Properties page you can clearly see a system setting called ‘user.timezone’ pointing to the abusing value. It rang a bell but this is not the time zone that is used when you set up a scheduled build as you may have multiple agents deployed in various time zone. The actual ‘server’ time zone is seen on the trigger’s setup page where you specify the desired run time.

‘user.timezone’! This is Java, my friend, and this is where things get a little bit different. Java implements a platform independent time zone management infrastructure. So if your operating system perfectly ‘understands’ your time zone it doesn’t guarantee it’s going to be successfully mapped to JVM’s time zone options.

You can force the time zone on JVM from the command line using a fancy –D<property name> syntax. But you need to make sure JVM understands it and it is configured properly for the JVM setup that you are using. I was serious enough (though in quite a daze) searching through numerous .xml/.bat files trying to find this nasty setting. No luck. And it was a relief as having to go through god knows what trying to hack a commercial software is far from an experience I could think of. And by the way, setting ‘user.timezone’ as an environment variable doesn’t work.

The [official documentation by JetBrains](http://confluence.jetbrains.net/display/TCD7/TeamCity+Documentation) is too concise regarding time zone issues. In fact, so concise that I completely missed information [from that little paragraph](http://confluence.jetbrains.net/display/TCD7/Known+Issues#KnownIssues-Wrongtimesforbuildscheduledtriggering%28Timezoneissues%29) during my initial investigation. It says:

> **Wrong times for build scheduled triggering (Timezone issues)**
> 
> Please make sure you use the latest JDK available for your platform (e.g. Oracle JDK download).  
> There were fixes in JDK 1.5 and 1.6 to address various wrong timezone reporting issues.

TeamCity installs JVM 6 (file versions are 6.0.310.5, dated Feb 17, 2012) but there was a stupid political decision to stay on DST (summer time) forever a year ago in Belarus and perhaps that version of JVM was still expecting old time zone information for Minsk from the operating system.

Microsoft released updates to Windows last fall and what used to be Minsk time zone (GMT+2) became Kaliningrad/Minsk time zone (GMT+3). This actually screws up JVM that’s installed with TeamCity (in fact, Microsoft was pretty fast releasing those time zone updates but… they never made it for Windows Phone 7.x ![Nyah-Nyah](https://blogcontent.azureedge.net/wlEmoticon-nyahnyah.png "Nyah-Nyah")).

Oracle provides [time zone updater](http://www.oracle.com/technetwork/java/javase/tzupdater-readme-136440.html) tool and it should be aware of the Minsk time zone change of 2011\. However, after I applied version 1.3.48 (July, 2012) I didn’t see any changes regarding Minsk time zone. Running the tool in test mode (-t) doesn’t report any issues but it did before applying changes. But the worst part is when it did there was no issue regarding Minsk which should indicate that JVM shipped with TeamCity should already be up to date. But it’s not.

Things happen in software…

So the options for now are:

*   Set a different GMT+3 time zone on the machine. This is weird and that other time zone may undergo a summer shift so I might want to find the one that does not.
*   Override the time zone on JVM with Europe/Minsk for TeamCity server and agent services if Europe/Minsk has really been updated.

UPDATE:

There is an open [Java defect](http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=7111966). As far as I can judge it's not fixed for Java 7 either.