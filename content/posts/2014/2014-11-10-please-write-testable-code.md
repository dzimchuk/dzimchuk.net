---
title: Please, write testable code
date: 2014-11-10 15:45:00
permalink: please-write-testable-code
uuid: a07dec8b-1e53-44d7-b853-a76452f74d79
tags: Practices
---

I was reviewing a rather big pull request lately and felt very uncomfortable as there were quite a few changes and additions but I didn’t see any tests. When reviewing code you don’t always follow the actual code logic but rather seek for evidence of best practices and proven principals being respected. One such proven practice is unit testing.

[![Quality](https://blogcontent.azureedge.net/Depositphotos_53986487_xs_thumb.jpg "Quality")](https://blogcontent.azureedge.net/Depositphotos_53986487_xs.jpg)

When I ran into the following piece:

```
public class SomeBase<T> where T : Hub
{
   protected IHubContext Context
   {
       get { return GlobalHost.ConnectionManager.GetHubContext<T>(); }
   }
}

```

I had to give up with a single question: how are you going to test this?

Apparently, developer’s intent was to have a handy base class he could derive from that would provide access to SignalR hub context when he needed to send messages to connected clients. However, the derived classes included quite some logic to decide when, what and to whom the messages should be sent. There were not tests to cover it!

The second issue with the code above is what this base class is supposed to represent. The actual name was not ‘SomeBase’ but it didn’t add any more value to it either. Imagine you have two references to `SomeBase` but actual objects are of totally different derived classes. The only thing they have in common is that at some point they want to reach out to connected clients. This is a clear violation of [Liskov substitution principle](http://en.wikipedia.org/wiki/Liskov_substitution_principle).

In order to clean that mess up and make code testable one would come up with an interface like this:

```
public interface IHubContextProvider<T>
{
   IHubContext<T> GetContext();
}

```

Implementation can be injected into our components or classes that need to notify clients. We can use our preferred mocking frameworks to create test providers and boy we got rid of that ugly inheritance that made no sense!

You might not actually need to get to `IHubContext` level, Your logic is very likely to issue higher level commands like notify a group of clients of an event or, for example, send a disconnect command to a particular client. When you add this level of abstraction you would inject a component with an interface like this:

```
public interface IMessageSender
{
   Task NotifyOnSomeEventAsync(string[] clients);
   Task EndSessionAsync(string clientId);
}

```

By making this one extra step you make your high level policy independent from low level implementation of the actual message delivery mechanism. That implementation is going to be pretty simple so there won’t be much to test. But even if there is, you can still write tests for your resource layer mocking interfaces such as `IHubContext`, `IDbContext`, etc.

Please note that In many cases that `IMessageSender` is not good enough. Remember about [Interface segregation principal](http://en.wikipedia.org/wiki/Interface_segregation_principle). Do not depend on things you don’t need. Keeping your interfaces cohesive will make your code more testable and maintainable.