---
title: Application and user permissions in Azure AD
date: 2016-05-03T12:52:00.000Z
lastmod: 2017-09-05T19:28:18.000Z
permalink: application-and-user-permissions-in-azure-ad
excerpt: Last time we had a tour over the experience of having your APIs protected by Azure AD. In this post I'd like to dive a little deeper into how you can better control access with roles that you can assigned to users and applications.
uuid: 1366d198-5e3d-4538-bf6f-a626dbee1e61
tags: Azure Active Directory, ASP.NET
---

[Last time](/post/protecting-your-apis-with-azure-active-directory) we had a tour over the experience of having your APIs protected by Azure AD. In this post I'd like to dive a little deeper into how you can better control access with roles that you can assigned to users and applications.

I'm still going to be using my [BookFast API](https://github.com/dzimchuk/book-fast-api) playground app and there are 2 activities that we're going to look at today:

![User and application initiated activities in BookFast](https://blogcontent.azureedge.net/azuread_roles_bookfast.png)

1. (shown in red) A user tries to create a new facility in the system.
2. (shown in green) A background process tries to process a batch update request that may involve creation of new facilities and updating of the existing ones.

In both cases it makes sense to control who or what has permissions to make changes to facilities. Only users who have been assigned a role of 'FacilityOwner' can manage facilities and we want only the background processes that have been specifically assigned the 'ImporterProcess' role to be able to batch import facilities.

## Implementing authorization policies in ASP.NET Core

The roles are app specific and it's a responsibility of the application to enforce them. In ASP.NET Core authorization infrastructure is coming with `Microsoft.AspNet.Authorization` package. This is where you're going to find familiar authorization attributes such as `AuthorizeAttribute` and `AllowAnonymousAttribute`, and some really cool stuff called authorization policies. With authorization policies you have flexibility to implement permission authorization checks that better suite your applications. You can check claims, roles, user names and of course come up with your own implementations.

Let's define a 'Facility.Write' policy for BookFast API:

```
private static void RegisterAuthorizationPolicies(IServiceCollection services)
{
    services.AddAuthorization(
        options =>
        {
            options.AddPolicy("Facility.Write", config =>
                              {
                                  config.RequireRole(InteractorRole.FacilityProvider.ToString(), InteractorRole.ImporterProcess.ToString());
                              });
        });
}
```

Pretty slick, huh? We've defined a policy and added a `RolesAuthorizationRequirement` with two accepted roles: 'FacilityProvider' and 'ImporterProcess'. `RolesAuthorizationRequirement` is going to be satisfied when an incoming request's `ClaimsPrinciple` contains either role (it applies `Any` logic when handling authorization). The policy is considered satisfied when all of its requirements are satisfied and in our case there is only one requirement.

To enforce the policy we need to specify it when decorating our controllers and/or actions with `AuthorizeAtribute`:

```
[Authorize(Policy = "Facility.Write")]
public class FacilityController : Controller
{
    ...
}
```

#### A quick test

Let's get a userless token using Client Credentials Grant. I already have a client app with ID 119f1731-3fd4-4c3d-acbc-2455879b0d54 registered in Azure AD, so:

```
POST https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

resource=https://devunleashed.onmicrosoft.com/book-fast-api&grant_type=client_credentials&client_id=119f1731-3fd4-4c3d-acbc-2455879b0d54&client_secret=<client secret>


HTTP/1.1 200 OK
Cache-Control: no-cache, no-store
Pragma: no-cache
Content-Type: application/json; charset=utf-8
Content-Length: 1296

{
    "token_type": "Bearer",
    "scope": "user_impersonation",
    "expires_in": "3599",
    "expires_on": "1461873034",
    "not_before": "1461869134",
    "resource": "https://devunleashed.onmicrosoft.com/book-fast-api",
    "access_token": "token value"
}
```

And try to invoke the protected API:

```
POST https://localhost:44361/api/facilities HTTP/1.1
Content-Type: application/json
Authorization: Bearer <access token>

{
    "Name": "test",
    "StreetAddress": "test"
}


HTTP/1.1 403 Forbidden
Content-Length: 0
```

As expected we get a cold 403 response meaning that the token has been validated and the `ClaimsPrincipal` has been initialized however according to our authorization policy the principal lacks required roles.

## Application level roles in Azure AD

Every application in Azure AD allows you to define app specific roles that can be assigned to users, user groups and applications. As we have already started testing the importer scenario let's assign the 'ImporterProcess' role to the client process app. But first, the role needs to be defined in the API app itself. That is, the API app exposes a bunch of its roles that can be assigned to consumers. Make sense?

When you download the manifest of the BookFast API (on the classic portal there is a button called 'Manage Manifest' at the bottom) you will see there is a collection called `appRoles` which is empty by default. Let's define our role:

```
"appRoles": [
  {
    "allowedMemberTypes": [
      "Application"
    ],
    "description": "Allows applications to access book-fast-api to create/update/delete facilities and accommodations",
    "displayName": "Access book-fast-api as an importer process",
    "id": "17a67f38-b915-40bb-bd09-228a5c8a997e",
    "isEnabled": true,
    "value": "ImporterProcess"
  }
]
```

The properties are pretty much self-explanatory. You need to assign a unique ID to the role and decide who or what can get assigned the role. This is controlled by the `allowedMemberTypes` collection. In this case I want this role to only be assigned to applications, not users.

Now we need to upload the modified manifest back to the BookFast API app by using the same 'Manage manifest' button on the portal that we used to download it.

Assigning the role to the consumer app representing the importer process can be done on the portal on the 'Configure' tab of the consumer app:

![Granting application level permission in Azure AD](https://blogcontent.azureedge.net/azuread_app_permission.png)

It's worth noting that the assignment has to be done by an administrator.

#### Testing it out

Let's request a new access token and repeat the attempt to add a new facility.

```
POST https://localhost:44361/api/facilities HTTP/1.1
Content-Type: application/json
Authorization: Bearer <access token>

{
    "Name": "test",
    "StreetAddress": "test"
}


HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Location: https://localhost:44361/api/facilities/0ad1fe14-107a-4cdf-9cc0-d882174f512a

{
    "Id": "0ad1fe14-107a-4cdf-9cc0-d882174f512a",
    "Name": "test",
    "Description": null,
    "StreetAddress": "test",
    "Longitude": null,
    "Latitude": null,
    "AccommodationCount": 0
}
```

Sweet! But how did it work? If we look at the new access token we will find out that a claim of type `roles` has been added by Azure AD.

```
{
    "aud": "https://devunleashed.onmicrosoft.com/book-fast-api",
    "iss": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
    "iat": 1461924520,
    "nbf": 1461924520,
    "exp": 1461928420,
    "appid": "119f1731-3fd4-4c3d-acbc-2455879b0d54",
    "appidacr": "1",
    "idp": "https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/",
    "oid": "970c6d5c-e200-481c-a134-6d0287f3c406",
    "roles": ["ImporterProcess"],
    "sub": "970c6d5c-e200-481c-a134-6d0287f3c406",
    "tid": "70005c1f-ea47-488e-8f57-c3543485f1d0",
    "ver": "1.0"
}
```

The claims contains an array of roles that apply to the context in which the access token is requested. That is, if we request a token as an application we only get roles that have been assigned to the client application and if we request a token using a delegated flow we will get roles that have been assigned to a user that the client app acts on behalf of.

As you know, we use `Microsoft.AspNet.Authentication.JwtBearer` package on the API side to handle the token and it ultimately relies on `System.IdentityModel.Tokens.Jwt` package to actually parse the token's payload. It creates an internal representation of the token (`JwtSecurityToken`) with claims that have their types defined by mapping shortened versions of claim types found in the token to claim types defined in the familiar `System.Security.Claims.ClaimTypes` class. So the `roles` claim gets mapped to `http://schemas.microsoft.com/ws/2008/06/identity/claims/role`.

When the `ClaimsIdentity` is being initialized it gets populated with a collection of claims (`System.Security.Claims.Claim`) and it's also given claim types that should be used to look up 'name' and 'roles' claims. By default, these are 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' and 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role' respectively but it can be overwritten with `TokenValidationParameters` when configuring the middleware. You want to do that when your STS uses a different convention but with Azure AD you go with defaults.

This all makes it possible for `RolesAuthorizationRequirement` to rely on the familiar `IsInRole` method that it calls on the principal when authorizing requests.

## Azure AD application model and role assignments

Before we move on I'd like to show you how role assignments are reflected in Azure AD application model. But that requires that you have at least some familiarity with it and have an idea of what a ServicePrincipal is.

So far we've worked with 'applications' on the Azure portal but you should be aware that there are distinct concepts in Azure AD: Applications and ServicePrincipals. Applications can be thought of as blue prints that define your apps, whereas ServicePrincipals are concrete representatives of the applications in particular tenants. When you define an app in a tenant it automatically gets its principal in that tenant. However, one application can have multiple principals defined in different tenants. Think, for exampe, of an app created in tenant A that allows users from other tenants to access it. Apps like this are called multitenant. When a user from tenant B gives her consent to the app from tenant A a ServicePrincipal for the app is created in tenant B. This principal is a concrete representative of the app in tenant B. You can read more on these essential concepts [here](https://azure.microsoft.com/en-us/documentation/articles/active-directory-application-objects/).

Now before we can look at role assignments we need to find a ServicePrincipal for the BookFast API app. We're going to use a convenient tool called [Graph Explorer](https://graphexplorer2.cloudapp.net) that allows us to query Graph API of Azure AD.

Once logged in as an administrator of my 'Dev Unleashed' tenant I can run a query like this:

```
GET https://graph.windows.net/devunleashed.onmicrosoft.com/servicePrincipals?$filter=displayName+eq+'book-fast-api'

{
  "odata.metadata": "https://graph.windows.net/devunleashed.onmicrosoft.com/$metadata#directoryObjects/Microsoft.DirectoryServices.ServicePrincipal",
  "value": [
    {
      "objectType": "ServicePrincipal",
      "objectId": "f4b5edd0-82f6-4350-b01b-43ecc24f5b4a",
      "appDisplayName": "book-fast-api",
      "appId": "7a65f361-a9e2-4607-9026-c9e97d56aae6",
      "appOwnerTenantId": "70005c1f-ea47-488e-8f57-c3543485f1d0",
      "appRoleAssignmentRequired": false,
      "appRoles": [
        {
          "allowedMemberTypes": [
            "Application"
          ],
          "description": "Allows applications to access book-fast-api to create/update/delete facilities and accommodations",
          "displayName": "Access book-fast-api as an importer process",
          "id": "17a67f38-b915-40bb-bd09-228a5c8a997e",
          "isEnabled": true,
          "value": "ImporterProcess"
        }
      ],
      "displayName": "book-fast-api",
      "servicePrincipalNames": [
        "https://devunleashed.onmicrosoft.com/book-fast-api",
        "7a65f361-a9e2-4607-9026-c9e97d56aae6"
      ]
    }
  ]
}
```

I omitted a lot of properties but left some of them so that you can have a sense of what it looks like. You probably have recognized our 'ImporterProcess' role that got inherited from the Application object. It makes perfect sense because the Application may be defined in another tenant and we need to be able to assign roles to apps and users from the consuming tenants thus we need to represent the exposed roles in the principal objects.

Every object in Azure ID is identified by its unique `objectId` these object ID's can be used to directly access object as well as to glue things together.

When we assigned a role to a consuming app an assignment record was actually associated with the target (BookFast API) app's principal:

```
GET https://graph.windows.net/devunleashed.onmicrosoft.com/servicePrincipals/f4b5edd0-82f6-4350-b01b-43ecc24f5b4a/appRoleAssignedTo

{
  "odata.metadata": "https://graph.windows.net/devunleashed.onmicrosoft.com/$metadata#directoryObjects/Microsoft.DirectoryServices.AppRoleAssignment",
  "value": [
    {
      "odata.type": "Microsoft.DirectoryServices.AppRoleAssignment",
      "objectType": "AppRoleAssignment",
      "objectId": "XG0MlwDiHEihNG0Ch_PEBuRqti4hbAVGpecosriLrRY",
      "deletionTimestamp": null,
      "creationTimestamp": "2016-04-28T18:58:02.4056036Z",
      "id": "17a67f38-b915-40bb-bd09-228a5c8a997e",
      "principalDisplayName": "book-fast-internal",
      "principalId": "970c6d5c-e200-481c-a134-6d0287f3c406",
      "principalType": "ServicePrincipal",
      "resourceDisplayName": "book-fast-api",
      "resourceId": "f4b5edd0-82f6-4350-b01b-43ecc24f5b4a"
    },

    ...

  ]
}
```

Here we see an assignment of principal 'book-fast-internal' (which represents a client app for the importer process) to a resource 'book-fast-api' (which is the ServicePrincipal of BookFast API as you can tell by its `objectId` 'f4b5edd0-82f6-4350-b01b-43ecc24f5b4a') in the role of '17a67f38-b915-40bb-bd09-228a5c8a997e'. If you scroll up a bit you will  recognize the role's ID as it's the one we used for the 'ImporterProcess'.

Notice the `principalType` value that indicates that the assignment was done to a ServicePrincipal, that is, to an app, not a user. 

## User roles in Azure AD

Now let's enable the facility provider flow in BookFast API by defining a role that can be assigned to users and groups:

```
{
  "allowedMemberTypes": [
    "User"
  ],
  "description": "Allows users to access book-fast-api to create/update/delete facilities and accommodations",
  "displayName": "Access book-fast-api as a facility provider",
  "id": "d525273c-6286-4e59-873b-4b0869f71770",
  "isEnabled": true,
  "value": "FacilityProvider"
}
```

We've created a new ID for the role and set `allowedMemberTypes` to 'User' as opposed to 'Application' that we used previously. When we allow to role to be assigned to 'User' can be assigned to both users and groups.

Note that `allowedMemberTypes` is actually a collection and we could have reused our previous 'ImporterProcess' role to enable it for users too. However, in BookFast API these are separate roles and thus we reflect that in the AD app.

Once the updated manifest for book-fast-api has been uploaded administrators can start assigning users to it on the 'Users' tab of the API app. When assigning a user the administrator is presented with a dialog to choose a role to assign the user to:

![Assigning a user to an app role in Azure AD](https://blogcontent.azureedge.net/azuread_user_assignment_3.png)

Using Graph API we can now see user assignments:

```
GET https://graph.windows.net/devunleashed.onmicrosoft.com/servicePrincipals/f4b5edd0-82f6-4350-b01b-43ecc24f5b4a/appRoleAssignedTo

{
  "odata.metadata": "https://graph.windows.net/devunleashed.onmicrosoft.com/$metadata#directoryObjects/Microsoft.DirectoryServices.AppRoleAssignment",
  "value": [
    {
      "odata.type": "Microsoft.DirectoryServices.AppRoleAssignment",
      "objectType": "AppRoleAssignment",
      "objectId": "OD2oPtbadkWXAZ8OFTwytWc12hWKB6NAi9bVHtwDmrw",
      "deletionTimestamp": null,
      "creationTimestamp": null,
      "id": "d525273c-6286-4e59-873b-4b0869f71770",
      "principalDisplayName": "New Fella",
      "principalId": "3ea83d38-dad6-4576-9701-9f0e153c32b5",
      "principalType": "User",
      "resourceDisplayName": "book-fast-api",
      "resourceId": "f4b5edd0-82f6-4350-b01b-43ecc24f5b4a"
    },

    ...
  ]
}
```

Spot the difference? Yes, `principalType` is now 'User'. Another possible values is 'Group' if roles are assigned to directory groups but it's supported only in the paid version of Azure AD.

One more thing I'd like to mention before I wind up this post. By default, user assignments are not required meaning that any user of the tenant can request access to an app. The `roles` claim in their tokens will be missing and your API will reject requests with these tokens if your authorization policy requires a certain role to be present in the token. In some scenarios you may want all users to be qualified by roles and enforce user assignments for your apps. There is a special option on the 'Configure' tab to enable mandatory user assignments which is reflected in `appRoleAssignmentRequired` property of the ServicePrincipal object. Why principal? Because it's a tenant specific setting: some may require it, some may not.