while IFS= read -r line; do
    [[ "$line" != *"="* ]] && continue
    [[ "$line" = *"#"* ]] && continue

    name="${line%%=*}"
    value="${line#*=}"

    echo "$value" | npx wrangler secret put $name
done < "./.env"
