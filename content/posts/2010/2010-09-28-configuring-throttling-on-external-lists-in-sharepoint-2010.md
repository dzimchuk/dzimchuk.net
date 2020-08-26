---
title: Configuring throttling on external lists in SharePoint 2010
date: 2010-09-28 06:19:00
permalink: configuring-throttling-on-external-lists-in-sharepoint-2010
uuid: aab90f68-c393-4a68-978e-2b62e46b5456
tags: SharePoint
---

SharePoint Server 2010 includes a great feature called Business Connectivity Services that allows to consume data from external sources and present it as SharePoint lists. You can consume data from databases, web (WCF and not only) services and even from the custom BDC entity services (which is just custom .NET code that you can develop and deploy into SharePoint). Being able to present this information as lists gives us a consistent programming model against different data sources.

However, external lists are throttled to protect the server from being overwhelmed by the amount of external data. There are limits on a number of rows that can be fetched from external databases, on the size of the data that can be received from web services and there are also preconfigured timeouts that are applied when talking to databases and services. We should keep this in mind and writing our functionality that relies on it and that the throttling values can be configured.

I had to learn it when I hit the following error:

> Unable to display this Web Part. To troubleshoot the problem, open this Web page in a Microsoft SharePoint Foundation-compatible HTML editor such as Microsoft SharePoint Designer. If the problem persists, contact your Web server administrator.

I was trying to get data from a database table that contains a bit more than 10000 records. I was trying to display that data in an external list that I created with SharePoint Designer.

As a curious person I started sneaking around and this is what I found in the log file:

> Error while executing web part: System.InvalidOperationException: Unable to open the specified list item. ---> Microsoft.BusinessData.Runtime.ExceededLimitException: Database Connector has throttled the response. The response from database contains more than '2000' rows. The maximum number of rows that can be read through Database Connector is '2000'. The limit can be changed via the 'Set-SPBusinessDataCatalogThrottleConfig' cmdlet.

It’s really great to see messages that really tells you what happened and how to remedy the situation! It was the case here as well.

Official documentation I found at [Set-SPBusinessDataCatalogThrottleConfig](http://technet.microsoft.com/en-us/library/ff607630.aspx) and [Get-SPBusinessDataCatalogThrottleConfig](http://technet.microsoft.com/en-us/library/ff607904.aspx)looked a little bit scary. For example, what should I pass as a required ServiceApplicationProxy parameter?

Then I hit upon this post that made everything crystal clear: [Large List Throttling for External Lists in SharePoint 2010](http://blogs.technet.com/b/speschka/archive/2009/11/13/large-list-throttling-for-external-lists-in-sharepoint-2010.aspx).

I figured that ‘Business Data Catalog’ is what is now called ‘Business Connectivity Services’ and as my default installation already sets up a service called ‘Business Data Connectivity Service’ (you can check it through the Central Administration –> Application Management –> Manager Service Applications) I can get the mysterious ServiceApplicationProxy like this:

```
Get-SPServiceApplicationProxy | 
  where {$_ -match "Business Data Connectivity Service"}
```

Fire up PowerShell and execute it:

[![Getting ServiceApplicationProxy](https://blogcontent.azureedge.net/sp_throttle1_thumb.png "Getting ServiceApplicationProxy")](https://blogcontent.azureedge.net/sp_throttle1.png)

There is a special link in the start menu called SharePoints Management Shell that launches PowerShell like this (ignore the line breaks):

```
C:\Windows\System32\WindowsPowerShell\v1.0\PowerShell.exe  
 -NoExit  
 " & ' C:\Program Files\Common Files\Microsoft Shared\
       Web Server Extensions\14\CONFIG\POWERSHELL\Registration
       \\sharepoint.ps1 ' "
```

Alright, let’s go ahead and check our current setting for the maximum database items:

```
$bdcAppProxy = Get-SPServiceApplicationProxy
   | where {$_ -match "Business Data Connectivity Service"}
Get-SPBusinessDataCatalogThrottleConfig 
   -Scope Database -ThrottleType Items 
   -ServiceApplicationProxy $bdcAppProxy
```

[![Displaying default throttling value](https://blogcontent.azureedge.net/sp_throttle2_thumb.png "Displaying default throttling value")](https://blogcontent.azureedge.net/sp_throttle2.png)

It turns out that Get-SPBusinessDataCatalogThrottleConfig returns a throttle ID, that we can use in corresponding calls to Set-SPBusinessDataCatalogThrottleConfig so let’s increase the throttling value as suggested in the above mentioned post:

```
$throttleDb = Get-SPBusinessDataCatalogThrottleConfig 
  -Scope Database -ThrottleType Items 
  -ServiceApplicationProxy $bdcAppProxy

Set-SPBusinessDataCatalogThrottleConfig 
  -Identity $throttleDb -maximum 11000 -default 8000
```

We can verify it has been applied:

[![Verifying that the new throttling value has been applied](https://blogcontent.azureedge.net/sp-throttle3_thumb.png "Verifying that the new throttling value has been applied")](https://blogcontent.azureedge.net/sp-throttle3.png)

Now our list successfully gets data from that table.

Remember, there are also throttling settings on the amount of data that can be received from web services and there are default 3 minutes timeouts.