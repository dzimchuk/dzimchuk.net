---
title: Implementing hybrid authentication in Azure
date: 2018-08-16 16:25:00
permalink: implementing-hybrid-authentication-in-azure
excerpt: Providing SSO across on-premises applications and those running in the cloud (yours and 3rd party), enabling access to applications with organizational as well as individual credentials are all examples of what is called hybrid authentication. How would you approach implementing it in your solution?
uuid: 5241ebca-13f6-456f-8880-d8e9f40299eb
tags: Azure Active Directory, Security
---

It's not uncommon for enterprises moving their applications to the cloud to require hybrid authentication that enables SSO for internal users who authenticate with their corporate credentials across cloud and on-premises resources and applications.

There is another aspect to hybrid authentication that involves customer facing applications. Customers access these applications with their individual accounts, often preferring to re-use credentials of an external identity provider such as GitHub or Facebook. Still, internal users have certain administrative roles in these applications and need to access them using their corporate credentials.

Yet another aspect of hybrid authentication is collaboration between organizations when employees of a partner organization access resources of the current organization. Traditionally this has been solved using guest accounts but there has to be a better way.

When designing an authentication solution for an application running in the cloud that's going to be accessed by different types of users you need to answer a few questions:

* How are you going to integrate with your on-premises AD?
* Do you want to maintain a local database for individual accounts or do you want to go with some of the SAAS offerings available?
* How are you going to marshal authentication requests to appropriate identity providers?
* How are you going to authorize access to the application once a user has been authenticated?

## Integration with on-premises AD

Answering the first question you would probably be evaluating federation with AD FS vs Azure Active Directory.

AD FS is a Windows Server role that exposes endpoints supporting various claims-based identity protocols. As it's running on the domain-joined servers it enables Intergrated Windows Authentication giving internal users SSO experience. It also gives you full control over the authentication process: it happens on-premises, you can customize claims and you can set up third party multi-factor authentication (MFA) providers.

On the other hand, it's another farm of servers to maintain to insure high availability. AD FS requires administrative access to provision applications. And it may have a limited protocol support depending on the server version. AD FS v3 (Windows Server 2012 R2) supports SAML2, WL-Federation, WS-Trust and authorization code grant OAuth2 flow. However, Windows Server 2016 brings support for all OAuth2 and OpenID Connect flows.

Azure Active Directory is a highly available global authentication provider. It enables SSO across your on-premises and cloud applications (through Azure AD Connect) as well as external applications such as Office 365 or VSTS or even your partner organizations' apps. It supports modern protocols (as well as classic SAML and WS-Federation) and there are client libraries available to streamline development of server-side and client-side applications.

Azure AD is a multi-tenant system that enables automatic provisioning of apps in consuming tenants (organizations) without any explicit work from administrators.

The way you integrate Azure AD with your on-premises AD is by using [Azure AD Connect](https://docs.microsoft.com/en-us/azure/active-directory/connect/active-directory-aadconnect). There are 3 options to choose from depending on a particular organization's security policy:

- [Password hash synchronization](https://docs.microsoft.com/en-us/azure/active-directory/connect/active-directory-aadconnectsync-implement-password-hash-synchronization) to the cloud;
- [Pass-through authentication](https://docs.microsoft.com/en-us/azure/active-directory/connect/active-directory-aadconnect-pass-through-authentication) over an agent installed in the domain (password hashes never leave your network);
- Federation with AD FS (if you still require full control over the authentication process performed on-premises and the ability to use a third party MFA provider; Azure AD will redirect the user to the AD FS sign-in page).

The first two options enable [seamless SSO](https://docs.microsoft.com/en-us/azure/active-directory/connect/active-directory-aadconnect-sso-how-it-works) when corporate users accessing the application from domain-joined devices don't need to type in their passwords and sometimes even type in their user names. The feature relies on JavaScript emitted on the Azure AD sign-in page that tries to obtain a Kerberos ticket from the domain controller and send it to Azure AD. Azure AD is able to validate the ticket and complete the sign-in process as it receives the shared secrets as part of the Azure AD Connect configuration.

This feature is not applicable when you use federation with AD FS though because the latter is running on the domain-joined servers it can validate Kerberos tickets directly so corporate users get their SSO experience too.

However, with Azure AD you can have SSO across your on-premises applications *and* third party applications running in the cloud or in the partners' networks (given that they use Azure AD). Accessing your partner's applications using your corporate credentials is another killer feature in Azure AD referred to as [B2B collaboration](https://docs.microsoft.com/en-us/azure/active-directory/b2b/what-is-b2b). No more guest account management, and at the same time you have fine-grained control over what resources your partners can access.

## Individual accounts

You can choose to go the good old way of storing credentials of individual external user accounts in the database and implementing all the expected functionality in your application related to account management. That includes account registration, credentials validation, password reset flow and so on. And all of that is *not* part of your app domain! It has nothing to do with your business. Yet, it adds considerable development effort and an increased security risk when something is not done right.

Going with a proven middleware such as [IdentityServer](http://identityserver.io/) or [OpenIddict](https://github.com/openiddict/openiddict-core) would be the right choice and mitigate most of these issues.

Alternatively, you could have a look at SAAS offerings such as [Azure AD B2C](https://azure.microsoft.com/en-us/services/active-directory-b2c/). It supports all self-service scenarios (sign-up, password reset, profile editing), allows you to fully customize its UI pages, enable MFA with a single checkbox, and easily integrate social identity providers.

## Routing authentication requests

One of the possible hybrid authentication scenarios is an application that is accessed by internal users (employees) and customers. Employees are redirected to Azure AD or AD FS so they can use their corporate credentials. They expect SSO and they need to undergo any security policy set up in their organization (regular password change, MFA, etc). Customers are redirected to another system where they can enter their individual credentials. How do we route authentication requests to the chosen identity providers?

A straight-forward (and arguably a cleaner one from the architectural standpoint)  approach could be grouping components by actor. We might end up with internally and externally facing apps and corresponding sets of backend services configured for a particular identity provider.

But what if we don't have this luxury and it's a single application accessed from different entry points (DNS names)? Of what if our workflow implies common backend with tailored functionality per user type?

What if we don't want to couple with a particular identity provider?

A feasible answer to questions 3 and 4 mentioned earlier would be implementing a federation gateway between your application and identity providers.

![Federated-authentication--generic-](https://blogcontent.azureedge.net/2018/08/Federated-authentication--generic-.png)

The gateway has two purposes:

1. Routing authentication requests from different clients to their respective identity providers;
2. Issuing application specific tokens that are used by the clients to access application services. The gateway is also responsible for refreshing access tokens.

With the federation gateway we abstract from the identity providers' details (protocols, token formats, claims) and end up with a stable unified identity that we fully control.

For the gateway to work we need to identify clients. It can be conveniently done with `clientId` which is an essential parameter used in OpenID Connect and OAuth2 protocols. Different `clientId` can be assigned to application instances exposed over public and internal DNS names and/or to different application client types (e.g. web based management dashboard and mobile customer apps).

Implementation of the federation gateway is not a trivial task but with the middleware such as IdentityServer4 it becomes a lot more doable. Check out the official [documentation](https://identityserver4.readthedocs.io/en/release/topics/federation_gateway.html) for details.