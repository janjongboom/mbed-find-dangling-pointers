# Find dangling pointers

Memory on microcontrollers is scarce, so finding and closing memory leaks is crucial. This script helps you detect dangling pointers in Mbed OS 5 applications.

## Enabling memory tracing

First, enable [memory tracing](https://os.mbed.com/docs/latest/tutorials/optimizing.html#runtime-memory-tracing) via:

1. In `mbed_app.json` under `macros`, set:

    ```json
    {
        "macros": ["MBED_MEM_TRACING_ENABLED"]
    }
    ```

1. In your application, call:

    ```
    mbed_mem_trace_set_callback(mbed_mem_trace_default_callback);
    ```

1. Connect a serial monitor to your device - probably set a high baud rate to not slow down the application too much.

## Using this script

1. Install the script through npm.

    ```
    $ npm install mbed-find-dangling-ptrs -g
    ```

1. Save the complete serial output of your application to a file, then run:

    ```
    $ mbed-find-dangling-ptrs serial-log-file.txt path-to-your-elf-file.elf
    ```

    **Note:** You can find the `.elf` file in `BUILD/TARGET_NAME/GCC_ARM/`.

1. This will give you the dangling pointers:

    ```
    Extracting symbols from example/example.elf
    Extracting symbols OK

    Found 5 dangling pointers

    --------------------------------------------------
    5 dangling pointers (total: 3840 bytes): [ 0x200036c0 (768), 0x200039d0 (768), 0x20003ce0 (768), 0x20003ff0 (768), 0x20004300 (768) ]

        int main() {
            print_memory_info();
            mbed_mem_trace_set_callback(mbed_mem_trace_default_callback);

            while (true) {
                wait(2.0);

                void *ptr1 = malloc(512);
    >>>         void *ptr2 = calloc(768, 1);
                void *ptr3 = (void*)new DigitalOut(LED1);

                // Grab the heap statistics
                mbed_stats_heap_t heap_stats;
                mbed_stats_heap_get(&heap_stats);
                printf("Heap size: %lu / %lu bytes\r\n", heap_stats.current_size, heap_stats.reserved_size);

                // Forget to free a pointer
                free(ptr1);
                free(ptr3);
    ```

    The line that is marked with `>>>` is the line where the allocation happened.

## Example program

```cpp
#include "mbed.h"
#include "mbed_mem_trace.h"

DigitalOut led1(LED1);

void print_memory_info() {
    // allocate enough room for every thread's stack statistics
    int cnt = osThreadGetCount();
    mbed_stats_stack_t *stats = (mbed_stats_stack_t*) malloc(cnt * sizeof(mbed_stats_stack_t));

    cnt = mbed_stats_stack_get_each(stats, cnt);
    for (int i = 0; i < cnt; i++) {
        printf("Thread: 0x%lX, Stack size: %lu / %lu\r\n", stats[i].thread_id, stats[i].max_size, stats[i].reserved_size);
    }
    free(stats);

    // Grab the heap statistics
    mbed_stats_heap_t heap_stats;
    mbed_stats_heap_get(&heap_stats);
    printf("Heap size: %lu / %lu bytes\r\n", heap_stats.current_size, heap_stats.reserved_size);
}

int main() {
    print_memory_info();
    mbed_mem_trace_set_callback(mbed_mem_trace_default_callback);

    while (true) {
        wait(2.0);

        void *ptr1 = malloc(512);
        void *ptr2 = calloc(768, 1);
        void *ptr3 = (void*)new DigitalOut(LED1);
        void *ptr4 = malloc(256);

        ptr4 = realloc(ptr4, 512);

        // Grab the heap statistics
        mbed_stats_heap_t heap_stats;
        mbed_stats_heap_get(&heap_stats);
        printf("Heap size: %lu / %lu bytes\r\n", heap_stats.current_size, heap_stats.reserved_size);

        // Forget to free a pointer
        free(ptr1);
        free(ptr3);
        free(ptr4);
    }
}
```
