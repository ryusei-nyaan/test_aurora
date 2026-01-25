#!/bin/bash

HOST=""     # DBホスト名 or IP
PORT=5432               # DBポート（Aurora PostgreSQL の場合通常 5432）
USER="postgres"        # DBユーザー名
DB="testdb"       # DB名
LOGFILE="./monitor.log" # ログファイルのパス
TABLE="test_monitor_table"
PGPASS="" # 検証用のためハードコードでも良いが，基本は良くないので，外から呼び出してopenssl等で復号してから使うべき

while true; do
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    echo "==== [$TIMESTAMP] ====" | tee -a "$LOGFILE"

    echo "[DB CHECK] DROP TABLE IF EXISTS" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "DROP TABLE IF EXISTS $TABLE;" 2>&1 | tee -a "$LOGFILE"

    echo "[DB CHECK] CREATE TABLE" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "
    CREATE TABLE $TABLE (
        id SERIAL PRIMARY KEY,
        name TEXT,
        created_at TIMESTAMP DEFAULT now()
    );" 2>&1 | tee -a "$LOGFILE"

    echo "[DB CHECK] CREATE INDEX" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "
    CREATE INDEX ON $TABLE (name);" 2>&1 | tee -a "$LOGFILE"

    echo "[DB CHECK] INSERT INTO TABLE" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "
    INSERT INTO $TABLE (name) VALUES
        ('alpha'), ('bravo'), ('charlie');" 2>&1 | tee -a "$LOGFILE"

    echo "[DB CHECK] SELECT * FROM TABLE" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "
    SELECT * FROM $TABLE;" 2>&1 | tee -a "$LOGFILE"

    echo "[DB CHECK] DELETE FROM TABLE" | tee -a "$LOGFILE"
    PGPASSWORD="$PGPASS" psql -h "$HOST" -U "$USER" -d "$DB" -c "
    DELETE FROM $TABLE WHERE name = 'alpha';" 2>&1 | tee -a "$LOGFILE"


    echo "" | tee -a "$LOGFILE"

    sleep 1
done
