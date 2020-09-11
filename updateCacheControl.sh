#!/usr/bin/env bash

account=$1
sas=$2

for blob in $(az storage blob list -c \$web --account-name $account --sas-token "$sas" --prefix assets/ --query [].name -o tsv); do
	echo Updating: $blob
	az storage blob update -c \$web -n $blob --clear-content-settings false --content-cache-control "public, max-age=31536000" --account-name $account --sas-token "$sas"
done
