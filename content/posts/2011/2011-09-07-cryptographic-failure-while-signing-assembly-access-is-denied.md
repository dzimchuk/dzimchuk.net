---
title: Cryptographic failure while signing assembly… Access is denied.
date: 2011-09-07T09:50:00.000Z
lastmod: 2015-04-23T16:49:57.000Z
permalink: cryptographic-failure-while-signing-assembly-access-is-denied
uuid: b61aea7d-d1e9-4ae5-89d5-666f8cadde42
tags: Tips & Tricks
---

I have just completely reinstalled my laptop and was going to work on a project when suddenly I found out it woudn't build. For every assembly I was getting the following error:

> Cryptographic failure while signing assembly 'path\to\your.dll' -- 'Error signing assembly -- Access is denied.

It didn’t’ take long to discover the problem is well-known on at least Windows 7 environment (with VS 2010, I didn’t bother to check the older versions). I must have run into it some time (say, years) ago when I was re-installing but the issue completely evaporated from my memory so it kind of caught me off guard.

So, basically the user account you’re running under can’t access crypto keys located at c:\Users\All Users\Microsoft\Crypto\RSA\MachineKeys\. There are a bunch of them and it would be nice to identify the necessary ones (which is doable with [Process Monitor](http://technet.microsoft.com/en-us/sysinternals/bb896645)) however a quick advice is to give your user read permissions on the whole MachineKeys folder. Rough, but well, it’s amazing it hasn’t been officially addressed yet!

It was fun to discover that [SourceGear Vault](http://www.sourcegear.com/) that I use as a private source control system might probably have run into some issues and had to give their server’s pool identity explicit permissions:

[![permissions to MachineKeys for VaultAppPool](https://blogcontent.azureedge.net/machinekeys_vaultapppool._thumb.png "permissions to MachineKeys for VaultAppPool")](https://blogcontent.azureedge.net/machinekeys_vaultapppool..png)

They might have their own reasons though. Still, IUSR and NETWORK SERVICE accounts were given full control too however my local Administrators group wasn’t:

[![permissions to MachineKeys for Administrators](https://blogcontent.azureedge.net/machinekeys_administrators._thumb.png "permissions to MachineKeys for Administrators")](https://blogcontent.azureedge.net/machinekeys_administrators..png)

Note that my user is a member of above mentioned Administrators group and this group is the owner of this folder. This, however, isn’t enough for a member of the group to be able to give the group necessary permissions. It might have something to do with UAC, I wouldn’t say and frankly too lazy to check (as 2 system restarts are required, one when disabling UAC and another one when enabling it back again).

So, the proper procedure will be:

1.  Take ownership (click that Advanced button and you’ll see). Assign the ownership to your user.
2.  Then you can give your user read (or full control if you don’t mind) permissions on that folder.

I just wrote it as a reminder for myself. Hope next time I reinstall there will be one WTF less ![Smile](https://blogcontent.azureedge.net/wlEmoticon-smile_2.png "Smile").