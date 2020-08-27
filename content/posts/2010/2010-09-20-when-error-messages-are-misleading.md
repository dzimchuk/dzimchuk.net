---
title: When error messages are misleading
date: 2010-09-20T05:53:00.000Z
lastmod: 2015-04-23T17:16:27.000Z
permalink: when-error-messages-are-misleading
uuid: 879b3058-6104-4fcf-aeb9-e351b241beb4
tags: SharePoint
---

I’ve been playing with SharePoint Foundation 2010 and decided to test the API by writing a simple console application that would manipulate different SP objects. Although I have a decent ASP.NET experience I am a newbie to SharePoint so I got puzzled right away when I wanted to open a connection to my SP site:

```
using (SPSite siteCollection = 
         new SPSite("http://dzimchuk/sites/MyTestSite"))
{
    ...
}
```

This gave me the following error:

> The Web application at http://dzimchuk/sites/MyTestSite could not be found. Verify that you have typed the URL correctly. If the URL should be serving existing content, the system administrator may need to add a new request URL mapping to the intended application.

Hm, what do you mean ‘not found’? I can access this site with a browser without a problem! Ok, let’s try from another angle:

```
SPWebApplication webApp = 
    SPWebApplication.Lookup(new Uri("http://localhost"));
```

Oops, another error this time:

> This operation can be performed only on a computer that is joined to a server farm by users who have permissions in SQL Server to read from the configuration database. To connect this server to the server farm, use the SharePoint Products Configuration Wizard, located on the Start menu in Microsoft SharePoint 2010 Products.

I’ve run the wizard when I installed SharePoint on my development machine and don’t tell me this nonsense!

Now what really was the problem. SharePoint 2010 is 64 bit only and the default target for a console application in Visual Studio 2010 is [x86](https://connect.microsoft.com/VisualStudio/feedback/details/455103/new-c-console-application-targets-x86-by-default). You don't normally run into this when writing custom code for SharePoint because you usually put it in DLL's and class library projects in VS2010 still default to 'Any CPU'.

It’s likely that my application and SharePoint couldn’t agree on the way data was serialized and instead of giving me a reasonable hint it gave me irrelevant confusing messages.

Do you have a better explanation?