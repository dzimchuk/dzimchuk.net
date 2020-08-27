---
title: Push notification flow with Azure Notification Hubs
date: 2016-02-10T17:03:47.000Z
lastmod: 2018-03-18T15:10:37.000Z
permalink: push-notification-flow-with-azure-notification-hubs
excerpt: One of the commonly expected features of mobile apps is an ability to receive push notifications, that is, notifications that do not require the apps to be up and running and having an established connection with their backend.
uuid: 13d990d3-e442-4bf5-865a-50fdd6344df6
tags: Azure Services
---

One of the commonly expected features of mobile apps is an ability to receive push notifications, that is, notifications that do not require the apps to be up and running and having an established connection with their backend. Also if you have an app, chances are, you have it for more than one platform.

Whatever the platform it is, a general push notification flow is relatively the same:

*   A mobile app contacts its native PNS to retrieve its handle;
*   Then it sends the handle to its backend;
*   The backend persists the handle for later usage;
*   When it needs to send a push notification the backend contacts the PNS using the handle to target a specific mobile app instance;
*   The PNS forwards the notification to the device specified by the handle.

A Notification Hub stands in between your backend and the PNS. It is a broker that gives you a common API that abstracts your backend from communication details with a particular PNS. But that wouldn't be enough to make you want to use it. What makes Notification Hubs really useful is that they enable flexible addressing schemas and allow you to send messages to different platforms literally with a single call. This is achieved through maintaining a registry of subscriptions (PNS handles) and associated tags and templates.

Let's have a look at an example.

You are developing a mobile client app for a popular social network. The app should be able to notify users when people respond to their posts or comments or when someone follows them. Users want to be able to opt in or out of each type of notification. A single user usually has more than one device and she may set up different notification types on each device.

When registering apps with a Notification Hub you provide a set of tags that will allow you to target future notifications to particular app installations:

```
(Android device):
UserId:1
Event:Follow
Event:Comment

(Windows device):
UserId:1
Event:Comment
```

Let's say someone comments on a post of this user and you want to deliver this notification to all user's devices where she subscribed to this type of event:

```
var tagExpression = "UserId:1 && event:Comment";
var notification = new Dictionary<string, string> { { "message", "Someone commented on your post!" } };
await hub.SendTemplateNotificationAsync(notification, tagExpression);
```

Notice the `tagExpression` where you combine a set of tags that will be evaluated by the Notification Hub in order to determine a list of native push notification services and handles to be used to dispatch the message. In our case each of the user's devices will receive a notification as registrations from both of these devices happen to have the same set of tags. You can read up more on routing with tags and tag expressions [here](https://azure.microsoft.com/en-us/documentation/articles/notification-hubs-routing-tag-expressions/).

What's this dictionary that we used as a notification payload? The dictionary contains values for placeholders that you define in platform specific templates.

On a Windows device a template may look something like this:

```
<toast><visual><binding template="ToastText01"><text id="1">$(message)</text></binding></visual></toast>
```

On an iOS device the template may look like this:

```
{"aps":{"alert":"$(message)"}}
```

You define template when you register application installation with a Notification Hub. You can read more on templates [here](https://azure.microsoft.com/en-us/documentation/articles/notification-hubs-templates/).

## PNS handle, registration ID and application ID

App registration with a Notification Hub can be done directly from the client but I believe in all but very simple cases you will do it from the backend. The reason for that is that the backend needs to know the addressing schema and thus it has to control tags that are used during registration. There are 4 distinct activities that are related to setting up and sending push notifications: setting up a push notification channel, subscribing to topics, handling sign-off and dispatching notifications. In the remaining of this post I'm going to describe each one of them but before I continue I'd like to talk a little bit about app identification.

PNS handles have limited life span and it's the responsibility of mobile apps to refresh them by requesting new handles from their corresponding native PNS. Notification Hubs should be able to distinguish between different devices but it cannot be done with just PNS handles as they are transient. To solve this problem, Notification Hubs generate long living registration IDs that should be persisted so that we can refer to devices’ registration each time we need to update PNS handles, tags or templates.

Now the issue with registration IDs is that they are also transient. This is done on purpose to facilitate cleanup of mobile app instances that didn't properly unregister when they were uninstalled. For us it means that at some point registrations can expire and we should not use Notification Hubs as the only storage for registration details. A need for a local registry arises.

The local registry will contain all of the information we need to recreate (or update) a Notification Hub registration. This will include registration ID, PNS handle and a bunch of app specific tags.

Think of a sign-off scenario. When the user signs off you want to remove the registration so that no notifications are sent to this device anymore. When she signs back in you probably want to restore the registration. You will use a new PNS handle but you want to re-enable the user's subscriptions.

We need a constant ID for app installation so we can re-associate the app instance with its existing device record in the local registry. This application ID will be generated by the mobile app and will be unique per app installation across mobile platforms. It should be generated when the app is installed and should survive sign off/sign in activities.

The backend may also add application ID as a tag during registration with a Notification Hub. This will enable targeting a specific device by its ID.

## Registering a channel

A 'channel' may sound somewhat fuzzy but what I mean here is a process to enable push notifications for an app instance. It's not about subscribing to app specific events but rather about performing all of the registration steps that are necessary to make an app instance push-capable. These steps should normally be carried out when the user signs in.

![Registering for push notifications](https://blogcontent.azureedge.net/b77f1186-1a1b-4b93-a870-6ea2aaafd3f2.png)

A mobile app requests a handle from its native PNS and calls a register endpoint on its backend. Besides the handle the app sends its application ID and a value indicating its platform type (Android, Apple, etc). The platform type is necessary as the backend needs to use a platform specific template when registering with a Notification Hub. In fact this template selection 'switch' that will happen during registration will be the only place where we actually care about the platform.

The backend performs a registration against a Notification Hub by sending registration ID, PNS handle, platform template and a bunch of tags if they have been found in the local registry for the given application ID. If it's the first registration the backend can request a new registration ID from the Notification Hub. If it's a repeating registration the backend should try to re-use the registration ID from its local registry and be ready to handle `HttpStatusCode.Gone` response from the hub indicating that the registration had expired. In this case the backend should request another registration ID from the hub and retry the attempt. Have a look at some code example [here](https://msdn.microsoft.com/library/azure/dn743807.aspx?f=255&MSPPError=-2147217396).

The backend finally persists the new handle and possibly a new registration ID in the local registry.

This process is repeated when the mobile app needs to refresh its PNS handle or when the user re-signs into the app.

## Subscribing to topics

This step is about updating the app’s registration when the user enables or disables a notification for an app specific event or topic. It should normally be done over a separate endpoint that your backend exposes.

![Subscribing to a topic](https://blogcontent.azureedge.net/091a7975-3029-4c6b-96a4-9c1d4ac7304d.png)

An app specific event should be represented as a tag and this tag needs to be added to the Notification Hub registration as well as persisted in the local registry. Note that there is an alternative registration procedure called **Installation**. It has certain advantages over a regular registration that I describe in this post, such as partial updates, automatic installationId insertion as a tag, etc., you can find more details [here](https://azure.microsoft.com/en-us/documentation/articles/notification-hubs-registration-management/)). It should be noted that the workflow that I describe here pretty much covers everything you can achieve with installations.

## Handling sign-off

![Handling sign-off](https://blogcontent.azureedge.net/13d91898-e7fc-4043-ab50-bcd5386c6358.png)

The backend should provide an endpoint for the mobile app to unregister when the user signs off. All it needs to pass in is its application ID. The backend will be able to look up the app's registration ID in the local registry and remove its registration from the Notification Hub. The backend should keep the app's record in the local registry (mainly for tags) so it can re-create proper subscriptions the next time the user signs in on that device. This is totally optional though.

## Dispatching notifications

When an event is detected by the backend it needs to construct a notification payload and create a tag expression to properly address the message. The Notification Hub will use the expression to look up native PNS handles in its registry and will actually dispatch the notification to appropriate native push notification services.