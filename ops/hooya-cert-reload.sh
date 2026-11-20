#!/bin/sh
case " $RENEWED_DOMAINS " in
  *" hooyamode.ir "*) nginx -t && systemctl reload nginx ;;
esac
