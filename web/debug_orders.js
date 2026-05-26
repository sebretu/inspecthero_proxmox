
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugOrders() {
    console.log('Fetching recent orders...');
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                status,
                project_id,
                user_id,
                created_at,
                profiles(full_name),
                items:order_items(
                    id,
                    quantity,
                    custom_name,
                    material:materials(name)
                )
            `)
            .neq('status', 'CART')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching orders:', error);
            return;
        }

        console.log(`Found ${orders.length} orders.`);
        orders.forEach(o => {
            console.log(`Order ID: ${o.id}`);
            console.log(`Status: ${o.status}`);
            console.log(`Project: ${o.project_id}`);
            console.log(`User: ${o.profiles?.full_name || o.user_id}`);
            console.log(`Date: ${o.created_at}`);
            console.log('Items:');
            o.items.forEach(it => {
                const name = it.material ? it.material.name : it.custom_name;
                console.log(`  - ${name} (Qty: ${it.quantity})`);
            });
            console.log('---');
        });

    } catch (e) {
        console.error('Catch error:', e);
    }
}

debugOrders().then(() => console.log('Done')).catch(err => console.error('Final catch:', err));
