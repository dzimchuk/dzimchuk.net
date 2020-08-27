---
title: What do I look for at code reviews?
date: 2014-10-06T18:47:00.000Z
lastmod: 2015-04-22T17:54:49.000Z
permalink: what-do-i-look-for-at-code-reviews
uuid: 377b8945-7102-48e7-bc2a-565a50df8720
tags: Practices
---

I have been asked this question recently and for a moment I was at a loss to come up with a short answer because the topic is big! We practice code reviews every day in our team and everyone is encouraged to participate to advise and learn at the same time. These days thanks to tools like [Stash](https://www.atlassian.com/software/stash/) it is easy to get your whole team involved and it is also actually fun to collaborate on code! We have a policy in place requiring a certain number of approvals for each pull request to get merged in and this drives the quality of our code base.

I’m a big fan of [Clean Code](http://cleancoders.com/) and I highly recommend that every one watch this awesome series (and [get a book](http://www.amazon.com/gp/product/0132350882/ref=s9_psimh_gw_p14_d0_i1?pf_rd_m=ATVPDKIKX0DER&pf_rd_s=center-2&pf_rd_r=187XEQ7SPMYS4Q5B6B0H&pf_rd_t=101&pf_rd_p=1688200382&pf_rd_i=507846)). If you think you know how to program and you don’t need to be explained the basics I strongly recommend that you watch this series. And then make your company buy it for all of your peers to watch. Most of what I’m going to talk about is examined in deep detail by [Uncle Bob](http://en.wikipedia.org/wiki/Robert_Cecil_Martin) and contributes to the concept of the clean code.

So what do I look for at code reviews?

## Have design principals been respected?

I mostly have to work with object-oriented code so I first try to see if the code being reviewed is [SOLID](http://en.wikipedia.org/wiki/SOLID_%28object-oriented_design%29) enough. It is so amazingly tempting for developers to throw in a switch statement on an extensible set of options or create fuzzy ‘manager’ classes that do a lot but you can’t really tell what their primary purpose is. And what about those 20 lines long methods? Oh, and folks get creative at times and invent weird hierarchies with super base abstract classes that only have a bunch of often unrelated properties. Remember the square-rectangle problem? These things are extremely common.

Following SOLID principals helps us conquer such code smell issues as rigidity, fragility and immobility. These issues can put a cross sign on any software even if it used to show a lot of light in the beginning.

## Have unit tests been added or updated?

When a new behavior is added I normally expect a test. Often times I would expect more than one test. If there is a conditional statement there has to be a corresponding test. Now when the code has been changed it is natural to expect a change in the tests. If there is no any it should be an alarming sign.

It is important to have tests at all layers of our application. Our business tests define and protect our high level policy. Our data layer tests verify that our queries and commands work as expected. Our presentation layer tests normally verify transformation of the business objects and errors into corresponding representations that are delivered to consumers of our application. Separating tests by logical layers enable us to test at a very high grained level. Mocking frameworks are there to help us out with dependencies.

## Have errors been handled properly?

Have we logged errors? Have we re-thrown them if we couldn’t reasonably handle them? What will be the messages that a user will see? Did we add a test for each error? Error handling is as important as any other piece of logic in our software.

A closely related topic is logging. It is essential. I’ve seen projects putting off logging till very late and going to QA with crashing software and zero information on what when wrong. I’ve seen attempts to add logging (and error handling) afterwards as a dedicated development effort but the context was gone and it took endless QA and development cycles to restore it.

We need to make sure our logs are actually useful. ‘An error occurred’ is not what I’m looking for when diagnosing a problem. I want a stack trace and as much contextual information as possible.

## Is there an opportunity to automate?

These days we hear the term [DevOps](http://en.wikipedia.org/wiki/DevOps) more and more. DevOps is a culture that implies tight collaboration between development and operations in order to deliver quality software at a rapid pace. There is a continuous cycle of development, deployment, operation and learning/analyzing. For this cycle to go smoothly it is essential to automate everything from provisioning databases and accounts to deploying to collecting and archiving log data and extracting performance metrics.

We should be able to learn from this data, make changes and redeploy in a painless manner.

## Have follow-up tickets been created?

We should strive to keep our code as clean as possible. But we live in a real world and sometimes have to make shortcuts. They add up to our technical debt that has to be managed. Every single TODO or suboptimal design decision has to be registered in our tracking system so it stays on our radar.

Now I should make it clear that I’m talking about exceptional cases here. Don’t let your debt grow. Address these issues as soon as you can by including them in upcoming sprints. Remember about rigidity and fragility.

What do you look at during code reviews?