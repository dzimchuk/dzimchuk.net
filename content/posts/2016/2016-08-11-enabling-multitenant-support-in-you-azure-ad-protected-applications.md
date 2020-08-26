---
title: Enabling multitenant support in you Azure AD protected applications
date: 2016-08-11 10:20:00
permalink: enabling-multitenant-support-in-you-azure-ad-protected-applications
excerpt: Azure AD is a multitenant directory and it comes as no surprise that it supports scenarios of applications defined in one tenant to be accessible by users from other tenants (directories). In this post we're going to look at...
uuid: 69832d75-41e5-4691-8376-2151169e5702
tags: Azure Active Directory, ASP.NET
---

Azure AD is a multitenant directory and it comes as no surprise that it supports scenarios of applications defined in one tenant to be accessible by users from other tenants (directories). In this post we're going to look at how to enable our client and API applications to be multitenant and what common pitfalls or errors you may encounter when doing this. I'm going to keep using my [Book Fast](https://github.com/dzimchuk/book-fast) and [Book Fast API](https://github.com/dzimchuk/book-fast-api) sample ASP.NET Core applications which I've recently updated to support multitenancy.

## Enabling multitenant sign-in

One of the key properties you set when configuring OpenID Connect middleware is the Authority which is basically the address to be used to retrieve the necessary metadata about the identity provider. In single tenant applications you set it to something like 'https://login.microsoftonline.com/{tenantId}' where `tenantId` is either a Guid or a domain identifier of your tenant, e.g. 'https://login.microsoftonline.com/70005c1f-ea47-488e-8f57-c3543485f1d0' or 'https://login.microsoftonline.com/devunleashed.onmicrosoft.com'. When you're dealing with multitenant applications you can't use a specific tenant as an authority and Azure AD provides you with a reserved word that you use when defining the authority: `common`. Note that it's not a tenant identifier but rather a special endpoint that implements multitenant support.

When a user is redirected to the `common` authorization endpoint like this:

```
GET https://login.microsoftonline.com/common/oauth2/authorize?client_id={...}&redirect_uri={...}&response_type=code%20id_token&scope=openid%20profile&response_mode=form_post&nonce={...}&state={...}
```

Azure AD collects the email address as the login and tries to figure out which tenant should handle the credentials (based on the domain used in the email address). 'newfella@devunleashed.onmicrosoft.com' will be handled by 'Dev Unleashed' tenant and 'testuser@wildmonkeys.onmicrosoft.com' will be directed to 'Wild Monkeys'.

Now, if you try to sign in to an application from 'Dev Unleashed' with a user from 'Wild Monkeys' you're going to get the following error:

> AADSTS70001: Application with identifier '48c8741b-fc13-4a02-bb8f-4bf4df1b3c78' was not found in the directory wildmonkeys.onmicrosoft.com

Any application that can sign in users requires access to the user's profile. This delegated permission is added by default to any application you create in Azure AD. Now, of course, an application from tenant A cannot access user profiles from tenant B by default but Azure AD allows you to enable this by setting `availableToOtherTenants` property on the application's manifest to `true` (there is also a corresponding setting on the portal).

When the application is configured as multitenant and a user from another tenant tries to sign in she is presented with a consent page and once she has given her consent for the app from another tenant to access whatever the resources it declares it requires, Azure AD takes care of provisioning a ServicePrincipal for the app in the user's tenant and registering the permissions.

![Multitenant consent page](https://blogcontent.azureedge.net/multitenant-consent-page.png)

ServicePrincipal is a representative of an application in a particular tenant. The application itself can be defined in the same or other tenant but if the consent was given to it to access resources in a particular tenant, Azure AD creates a ServicePrincipal there (if one does not exist yet) and registers the permission(s) given. You can read about Applications and ServicePrincipals [here](https://azure.microsoft.com/en-us/documentation/articles/active-directory-application-objects/).

Using a tool such as [Graph Explorer](https://graphexplorer2.cloudapp.net/) you can check out the granted permissions in the target tenant:

```
GET https://graph.windows.net/wildmonkeys.onmicrosoft.com/oauth2PermissionGrants

{
  "odata.metadata": "https://graph.windows.net/wildmonkeys.onmicrosoft.com/$metadata#oauth2PermissionGrants",
  "value": [
    {
      "clientId": "c4cb11ab-c343-4a39-8d84-b6c600e0a324",
      "consentType": "Principal",
      "expiryTime": "2017-01-22T11:34:21.7387474",
      "objectId": "qxHLxEPDOUqNhLbGAOCjJBmeQVa8Y7ZAr7te6ViVxJn-JPVnmKcOR5SPsH9SXnQv",
      "principalId": "67f524fe-a798-470e-948f-b07f525e742f",
      "resourceId": "56419e19-63bc-40b6-afbb-5ee95895c499",
      "scope": "User.Read",
      "startTime": "0001-01-01T00:00:00"
    },
    ...
  ]
}
```

Let's decipher this. All objects in Azure AD have their unique object identifiers (objectId) and these are the Guids you see here. What the record above says is that an application's ServicePrincipal c4cb11ab-c343-4a39-8d84-b6c600e0a324 (Book Fast) was given a permission to access a target resource's ServicePrincipal 56419e19-63bc-40b6-afbb-5ee95895c499 (Azure Active Directory) on behalf of user 67f524fe-a798-470e-948f-b07f525e742f. And the scope of this access is limited to the permission called 'User.Read' that is defined by the Azure Active Directory application (in its manifest but it's also copied to its ServicePrinicipal in 'Wild Monkeys' tenant that you can check out at https://graph.windows.net/wildmonkeys.onmicrosoft.com/servicePrincipals/56419e19-63bc-40b6-afbb-5ee95895c499).

## Issuer validation

If you try to sign in again you're going to face another error which is coming from the middleware this time:

> Microsoft.IdentityModel.Tokens.SecurityTokenInvalidIssuerException: IDX10205: Issuer validation failed. Issuer: 'https://sts.windows.net/70005c1f-ea47-488e-8f57-c3543485f1d0/'. Did not match: validationParameters.ValidIssuer: 'https://sts.windows.net/{tenantid}/' or validationParameters.ValidIssuers: 'null'.

When the OpenID Connect middleware gets returned an ID token it tries to validate it and part of the validation procedure is the verification of the issuer (hey, if we want to trust the token we need to make sure it has been issued by the authority we trust). The middleware requests the necessary metadata from the `common` authority as we have configured it:

```
GET https://login.microsoftonline.com/common/.well-known/openid-configuration HTTP/1.1

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 1134

{
	"authorization_endpoint": "https://login.microsoftonline.com/common/oauth2/authorize",
	"token_endpoint": "https://login.microsoftonline.com/common/oauth2/token",
	"token_endpoint_auth_methods_supported": ["client_secret_post",
	"private_key_jwt"],
	"jwks_uri": "https://login.microsoftonline.com/common/discovery/keys",
	"response_modes_supported": ["query",
	"fragment",
	"form_post"],
	"subject_types_supported": ["pairwise"],
	"id_token_signing_alg_values_supported": ["RS256"],
	"http_logout_supported": true,
	"response_types_supported": ["code",
	"id_token",
	"code id_token",
	"token id_token",
	"token"],
	"scopes_supported": ["openid"],
	"issuer": "https://sts.windows.net/{tenantid}/",
	"claims_supported": ["sub",
	"iss",
	"aud",
	"exp",
	"iat",
	"auth_time",
	"acr",
	"amr",
	"nonce",
	"email",
	"given_name",
	"family_name",
	"nickname"],
	"microsoft_multi_refresh_token": true,
	"check_session_iframe": "https://login.microsoftonline.com/common/oauth2/checksession",
	"end_session_endpoint": "https://login.microsoftonline.com/common/oauth2/logout",
	"userinfo_endpoint": "https://login.microsoftonline.com/common/openid/userinfo",
	"tenant_region_scope": null,
	"cloud_instance_name": "microsoftonline.com"
}
```

Boom! Look at the issuer: 'https://sts.windows.net/{tenantid}/'. The `common` metadata endpoint has no idea about the tenant and the middleware tried to fall back on the pre-configured issuer(s) in validation patameters but could not find any.

There are a few things you can do about it:

- Specify a set of well known issuers. Set the `ValidIssuers` property on `Microsoft.IdentityModel.Tokens.TokenValidationParameters` to an array of issuers you support (use the full URI like 'https://sts.windows.net/c478e084-357e-4b68-9275-6744b7d71d10/').
- Implement a custom issuer validator and assign it to the `IssuerValidator` property. This is useful when you can't specify a predefined list of issuers in configuration and need some runtime logic to determine if you trust the issuer presented in the token.
- Disable issuer validation by setting the `ValidateIssuer` property to `false`. I seriously think we should not resort to it unless you have your reasons.

One more thing to note is that signing keys are common for all tenants. Whether you request the metadata from a tenant specific endpoint or the `common` endpoint you always get the 'https://login.microsoftonline.com/common/discovery/keys' URL to get the keys.

## Configuring your API apps to be multitenant

When your multitenant applications rely on your custom API app you need to make sure that API apps are multitenant enabled as well as they need to be able to validate access tokens issued by different tenants. On the portal (or in the app's manifest) it's still the same 'Application is multitenant' property that needs to be set to `true`.

If you had defined a dependency in your client app to the API app (by enabling certain delegated permissions) previously and now try to sign in with another tenant's user, you may get the following error:

> OpenIdConnectProtocolException: Message contains error: 'access_denied', error_description: 'AADSTS50000: There was an error issuing a token. AADSTS65005: The application needs access to a service that your organization Wild Monkeys has not subscribed to. Please contact your Administrator to review the configuration of your service subscriptions.

Azure AD automatically provisions a ServicePrincipal for the client app (given it has been multitenant enabled and the user provided her consent) but it needs a little help to provision the downstream API app(s). In the manifest of the API app you can find a property called `knownClientApplications` and you should provide a list of clients you support (the property takes an array of client ID's).

Now the consent should processed successfully and the delegated permission should be registered:

```
GET https://graph.windows.net/wildmonkeys.onmicrosoft.com/oauth2PermissionGrants

{
  "odata.metadata": "https://graph.windows.net/wildmonkeys.onmicrosoft.com/$metadata#oauth2PermissionGrants",
  "value": [
    {
      "clientId": "c4cb11ab-c343-4a39-8d84-b6c600e0a324",
      "consentType": "Principal",
      "expiryTime": "2017-01-22T11:34:21.7387474",
      "objectId": "qxHLxEPDOUqNhLbGAOCjJBmeQVa8Y7ZAr7te6ViVxJn-JPVnmKcOR5SPsH9SXnQv",
      "principalId": "67f524fe-a798-470e-948f-b07f525e742f",
      "resourceId": "56419e19-63bc-40b6-afbb-5ee95895c499",
      "scope": "User.Read",
      "startTime": "0001-01-01T00:00:00"
    },
    {
      "clientId": "c4cb11ab-c343-4a39-8d84-b6c600e0a324",
      "consentType": "Principal",
      "expiryTime": "2017-01-22T11:34:21.7387474",
      "objectId": "qxHLxEPDOUqNhLbGAOCjJP-nroHHIWVKj6aM72kNWzj-JPVnmKcOR5SPsH9SXnQv",
      "principalId": "67f524fe-a798-470e-948f-b07f525e742f",
      "resourceId": "81aea7ff-21c7-4a65-8fa6-8cef690d5b38",
      "scope": "user_impersonation",
      "startTime": "0001-01-01T00:00:00"
    },
	...
  ]
}
```

We've already seen the first permission and now we get the second one saying that the client app (c4cb11ab-c343-4a39-8d84-b6c600e0a324) was given access to the API app (81aea7ff-21c7-4a65-8fa6-8cef690d5b38) on behalf of user 67f524fe-a798-470e-948f-b07f525e742f. The actually permission is 'user_impersonation' as defined in the API's app manifest and if there were more permissions and we assigned them to the client app there would be more oauth2PermissionGrants records.

We haven't changed anything in our middleware configuration yet and mostly likely you're going run into the following error:

> Microsoft.IdentityModel.Tokens.SecurityTokenSignatureKeyNotFoundException: IDX10501: Signature validation failed. Unable to match 'kid': 'MnC_VZcATfM5pOYiJHMba9goEKY', 
token: '{"alg":"RS256","typ":"JWT","x5t":"MnC_VZcATfM5pOYiJHMba9goEKY","kid":"MnC_VZcATfM5pOYiJHMba9goEKY"}.{"aud":"https://devunleashed.onmicrosoft.com/book-fast-api","iss":"https://sts.windows.net/c478e084-357e-4b68-9275-6744b7d71d10/","iat":1469560722,"nbf":1469560722,"exp":1469564622,"acr":"1","amr":["pwd"],"appid":"48c8741b-fc13-4a02-bb8f-4bf4df1b3c78","appidacr":"1","family_name":"Doe","given_name":"John","ipaddr":"178.121.218.148","name":"John Doe","oid":"67f524fe-a798-470e-948f-b07f525e742f","scp":"user_impersonation","sub":"m4pX16RPYFN3kAgWtaEIuVNxL6xb0PZ86twh9sTFJgo","tid":"c478e084-357e-4b68-9275-6744b7d71d10","unique_name":"testuser@wildmonkeys.onmicrosoft.com","upn":"testuser@wildmonkeys.onmicrosoft.com","ver":"1.0"}'

This is weird and I still have no explanation for it because as we saw earlier signing keys are common for all tenants. Now, if you change the authority in your OpenID Connect middleware's configuration in your API app to `common` it should fix the error. Don't ask.

And, of course, the implications with the issuer validation stand true here as well.

## Application roles

If you rely on application roles it's good to know they work fine in multitenant apps. Administrators of the target tenants can assign their users to roles defined in your applications and this information will be available in the issued tokens. For example, here's the 'FacilityProvider' role I have in my Book Fast app:

```
"appRoles": [
  {
    "allowedMemberTypes": [
      "User"
    ],
    "description": "Allows users to access book-fast to create/update/delete facilities and accommodations",
    "displayName": "Access book-fast as a facility provider",
    "id": "1be7d8b0-d7bf-4fe8-8537-0099f5a896da",
    "isEnabled": true,
    "value": "FacilityProvider"
  }
]
```

Now if we check out the role assignments in the 'guest' Wild Monkeys tenant you should see this:

```
GET https://graph.windows.net/wildmonkeys.onmicrosoft.com/servicePrincipals/c4cb11ab-c343-4a39-8d84-b6c600e0a324/appRoleAssignedTo

{
  "odata.metadata": "https://graph.windows.net/wildmonkeys.onmicrosoft.com/$metadata#directoryObjects/Microsoft.DirectoryServices.AppRoleAssignment",
  "value": [
    {
      "odata.type": "Microsoft.DirectoryServices.AppRoleAssignment",
      "objectType": "AppRoleAssignment",
      "objectId": "_iT1Z5inDkeUj7B_Ul50LzolkH1mMHpLoyFG_UtLjzg",
      "deletionTimestamp": null,
      "creationTimestamp": null,
      "id": "1be7d8b0-d7bf-4fe8-8537-0099f5a896da",
      "principalDisplayName": "John Doe",
      "principalId": "67f524fe-a798-470e-948f-b07f525e742f",
      "principalType": "User",
      "resourceDisplayName": "book-fast",
      "resourceId": "c4cb11ab-c343-4a39-8d84-b6c600e0a324"
    },
	...
  ]
}
```

c4cb11ab-c343-4a39-8d84-b6c600e0a324 is the ServicePrincipal of the client app in Wild Monkeys realm and 'John Doe' has been assigned a role of 'Facility Provider' (notice the role's ID 1be7d8b0-d7bf-4fe8-8537-0099f5a896da from the app's manifest). If you want to learn more about application roles in Azure AD I suggest you have a look at [my post](/post/application-and-user-permissions-in-azure-ad) on the topic.