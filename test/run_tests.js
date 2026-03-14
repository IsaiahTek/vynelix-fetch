import { ApiClient } from '../src/base_api_client';
async function runTests() {
    console.log('--- Starting ApiClient Tests ---');
    let unauthorizedCalled = 0;
    // 1. Mock Fetch
    const mockFetch = (url, options) => {
        console.log(`[Mock Fetch] ${options.method} ${url}`);
        if (url.endsWith('/auth/refresh')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            });
        }
        if (url.endsWith('/error')) {
            return Promise.resolve({
                ok: false,
                status: 400,
                text: () => Promise.resolve(JSON.stringify({ message: 'Validation failed' })),
            });
        }
        if (url.endsWith('/unauthorized')) {
            unauthorizedCalled++;
            if (unauthorizedCalled === 1) {
                return Promise.resolve({
                    ok: false,
                    status: 401,
                });
            }
            // Succeed on retry
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ data: { id: 1, name: 'John Doe' } }),
            });
        }
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'success' }),
        });
    };
    // Inject mock fetch
    globalThis.fetch = mockFetch;
    const client = new ApiClient({
        baseUrl: 'https://api.example.com',
        authType: 'bearer',
        token: 'test-token',
        onError: (err) => console.log(`[onError Callback] ${err.title}: ${err.messages.join(', ')}`),
        onLogout: () => console.log('[onLogout Callback] Logged out successfully'),
    });
    // Test 1: Bearer Header with return type
    console.log('Test 1: Check Bearer Header');
    const testRes = await client.get('/test');
    console.log('Test 1 Result:', testRes.data);
    // Test 2: Error Callback
    console.log('\nTest 2: Check Error Callback');
    try {
        await client.get('/error');
    }
    catch (e) {
        console.log('Caught expected error');
    }
    // Test 3: Unauthorized & Refresh (Retry) with complex return type
    console.log('\nTest 3: Check 401 & Refresh Logic with User type');
    const res = await client.get('/unauthorized');
    console.log('Response after refresh retry:', JSON.stringify(res.data));
    console.assert(res.data.name === 'John Doe', 'Retry data mismatch');
    console.log('\n--- All Tests Execution Finished ---');
}
runTests().catch(console.error);
//# sourceMappingURL=run_tests.js.map