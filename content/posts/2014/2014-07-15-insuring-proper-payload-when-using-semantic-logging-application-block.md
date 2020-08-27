---
title: Insuring proper payload when using Semantic Logging Application Block
date: 2014-07-15T15:22:00.000Z
lastmod: 2017-09-05T19:07:34.000Z
permalink: insuring-proper-payload-when-using-semantic-logging-application-block
excerpt: I and my team have been using SLAB on our project where we create cloud services running on Azure. It’s important for publicly faced services to log everything so it's possible while analyzing that data to have a decent idea of what happened and how our services were used.
uuid: 4ac023af-ab6a-4a45-901a-7b15f98dfdf2
tags: Cloud Patterns, Semantic Logging
---

I and my team have been using [Semantic Logging Application Block](http://msdn.microsoft.com/en-us/library/dn440729(v=pandp.60).aspx) (hereinafter SLAB) on our project where we create cloud services running on Azure. It’s important for publicly faced services to [log everything](http://alexandrebrisebois.wordpress.com/2014/06/12/lessons-learned-on-azure-log-everything/) so it is possible when we analyze that data to have a decent idea of what happened and how our services were used.

You can read up on advantages of semantic logging over traditional logging on the [Patterns & Practices](http://msdn.microsoft.com/en-us/library/dn440729(v=pandp.60).aspx) site but for me it’s utmost important to have consumable logs, that is the logs that are easy to parse and easy to find information you need. The sheer amount of logged data that public web services produce is enormous so you have to rely on automated tools to extract the data you need and it makes it critical to have properly formed payload of the messages to achieve that.

When we just started we used quite a traditional approach when writing our logging methods that would look something like this:

```
[Event(1, Message = "Application event",
    Level = EventLevel.Informational)]
public void LogApplicationEvent(string message)
{
  if (this.IsEnabled()) 
    this.WriteEvent(1, message);
}

```

What’s wrong with this method is that we kept doing message formatting ourselves. We could create higher level decorators that accepted context specific parameters but our event sources contained methods similar to the one shown above.

SLAB supports a number of sinks to store data (flat files, SQL Server, Elasticsearch, etc). We use the [Azure Sink](http://www.nuget.org/packages/EnterpriseLibrary.SemanticLogging.WindowsAzure/) that writes messages to Azure Table Storage. If we look at out messages we would see Payload column that would contain a JSON object containing our message, for example:

```
{ “message”: “Begin processing request, Controller: <name>, Action: <name>, Elapsed time: <timespan>” }
```

While the message contains human readable data parsing it would require extra effort and is error prone as a developer could choose to format a message in a different way.

It would be great if we could payloads like this:

```
{ “message”: “Begin processing request", "controller": "<name>", "action": "<name>", "elapsedTime": "<timespan>” }
```

And SLAB supports just like this! All you have to do is pass your arguments to WriteEvent method:

```
[Event(1, Message = "Application event",
    Level = EventLevel.Informational)]
public void LogApplicationEvent(string message, 
    string controller, string actions, string elapsedTime)
{
  if (this.IsEnabled()) 
    this.WriteEvent(1, message, controller, action, elapsedTime);
}
```

It’s worth noting that there is a limited set of data types that can be passed in. Normally these have to be native .NET types and you can’t use structures like `TimeSpan` that’s why you see `elapsedTime` value passed as string.

Also Azure Sink comes with one nice feature. It creates a separate column in the Table Storage for each property of your payload. So you will have columns like 'Payload_message', 'Payload_controller' and so on.