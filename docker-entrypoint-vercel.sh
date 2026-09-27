#!/bin/sh
set -eu
PORT_TO_USE="${PORT:-80}"
sed -ri "s/^Listen [0-9]+/Listen ${PORT_TO_USE}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT_TO_USE}>/" /etc/apache2/sites-available/000-default.conf
exec apache2-foreground
