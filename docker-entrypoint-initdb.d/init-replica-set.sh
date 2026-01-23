#!/bin/bash
# Create keyfile for replica set
if [ ! -f /etc/mongodb-keyfile ]; then
  openssl rand -base64 756 > /etc/mongodb-keyfile
  chmod 400 /etc/mongodb-keyfile
  chown mongodb:mongodb /etc/mongodb-keyfile
fi
