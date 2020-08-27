---
title: Troubleshooting SLAB out-of-process logging
date: 2014-10-13T15:55:00.000Z
lastmod: 2015-04-22T17:56:34.000Z
permalink: troubleshooting-slab-out-of-process-logging
uuid: 72cd6671-6925-4978-9fa8-b5dc1f49df40
tags: Semantic Logging
---

When using [SLAB](http://msdn.microsoft.com/en-us/library/dn440729%28v=pandp.60%29.aspx) out-of-process service you may run into situation when events are not being logged. You make sure you call proper methods on your custom event sources but the events seem to go nowhere. It turns out that most likely you have an issue in your event sources. They (and/or [ETW](http://msdn.microsoft.com/en-us/magazine/cc163437.aspx) infrastructure) are too sensitive to errors like duplicate event ids or unsupported data types of the parameters being passed as part of the event payload. Even when there is a problem with a single method the whole event source starts functioning incorrectly and you won't see events from other methods.

The situation is different when using in-process listeners. In this case you will get a runtime error when trying to invoke a logging method that has issues. This will give you a clue of what's going on but you probably don't want to wait till you start getting runtime errors.

[![Troubleshooting SLAB](https://blogcontent.azureedge.net/Depositphotos_35132287_xs_thumb.jpg "Troubleshooting SLAB")](https://blogcontent.azureedge.net/Depositphotos_35132287_xs.jpg)

The good news is that SLAB provides a special utility called `EventSourceAnalyzer` that can verify various rules and conventions that you are expected to follow when creating your custom event source. The analyzer is available as a NuGet package called EnterpriseLibrary.SemanticLogging.EventSourceAnalyzer and is supposed to be used as part of your unit test suite like this:

```
public void InspectMyCustomEventSource()
{
    EventSourceAnalyzer.InspectAll(MyCustomEventSource.Instance);
} 

```

The `EventSourceAnalyzer` class includes a static `InspectAll` method that performs all the checks on your `EventSource` class. Here is a list of checks it performs:

*   Singleton event source  
    Checks that the `EventSource` instance is a singleton.
*   Manifest generation  
    Checks that a manifest can be generated from the `EventSource` class
*   Message format  
    Checks that the Message parameter of the `Event` attribute does not contain any invalid characters.
*   Event id mismatch  
    Checks that the event id in the `Event` attribute matches the event id passed to the `WriteEvent` method.
*   No event in the event source  
    Checks that the `EventSource` class contains at least one event method.
*   Duplicate events  
    Checks that event ids are not duplicated anywhere in the `EventSource` class.
*   Missing `Event` attributes  
    Checks that event methods in the `EventSource` class are decorated with the `Event` attribute.
*   Missing call to `WriteEvent`  
    Checks that all event methods invoke the `WriteEvent` method.
*   Mismatching keywords  
    Checks that the keywords used in the `Event` attribute match the keywords passed to the `IsEnabled` method, if it’s invoked.
*   Undefined opcode  
    Checks that opcodes used in the `Event` attribute have been defined.
*   Same type arguments order mismatch  
    Checks that if the event method has a sequence of parameters of the same type, that they are passed in the same order to the `WriteEvent` method.
*   Different type arguments order mismatch  
    Checks that if the event method has a sequence of parameters of different types, that they are passed in the same order to the `WriteEvent` method.
*   `Enum` types generate an invalid manifest  
    The use of certain enum types results in an invalid manifest being generated.

Let's have a look at a quick example.

```
[Event(1,
    Message = "Application Failure: {0}",
    Level = EventLevel.Critical,
    Keywords = Keywords.Diagnostic)]
internal void Failure( string message)
{
    WriteEvent(1, message);
}

[Event(2,
    Message = "Starting up.",
    Keywords = Keywords.Perf,
    Level = EventLevel.Informational)]
internal void Startup()
{
    WriteEvent(1);
}

```

Event Id that is being passed to `WriteEvent` is different from the one defined in the Event attribute. This is an unfortunate situation that can happen when someone is adding a lot of new methods to the event source especially when using an enumeration for even ids where members may look very similar.

If we use in-process listener we are going to get a runtime error when calling the `Startup` method:

```
System.ArgumentException Event Startup is givien event ID 2 but 1 was passed to WriteEvent.

```

What's interesting is that if we configure the in-process listener by passing in and instance of our event source into `EnableEvents` method (there are overloads that accept either event source name or event source instance) we will get this error when calling ANY method on the event source.

Now if we switch to using out-of-process listener neither of our methods will give us runtime errors. However, the events will never make it to our sinks either! The only way to spot the problem is to write a unit test using `EventSourceAnalyzer` to get the same error messages at build time. In fact, no matter what model we use (in-process or out-of-process) we should always write unit tests for our event sources because we don't want to run into issues with diagnostics at runtime.