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

1. Clone this repository.

    ```
    $ git clone https://github.com/janjongboom/mbed-find-dangling-pointers
    ```

1. Save the complete serial output of your application to a file, then run:

    ```
    $ cat example/log-file.txt | node find-dangling-ptrs.js
    ```

1. This will give you the dangling pointers:

    ```
    Dangling pointers { '0x200036c0': { loc: '0x1867', size: 768 },
        '0x200039d0': { loc: '0x1867', size: 768 },
        '0x20003ce0': { loc: '0x1867', size: 768 },
        '0x20003ff0': { loc: '0x1867', size: 768 },
        '0x20004300': { loc: '0x1867', size: 768 } }
    ```

1. To find the exact location where these are declared, use `arm-none-eabi-objdump` on the `.elf` file (need to use a debug build):

    ```
    $ arm-none-eabi-objdump -S example/example.elf > symbols.txt
    ```

1. Open `symbols.txt` and look for the value of `loc` minus 1 ([why -1?](https://vilimpoc.org/blog/2017/02/01/stack-heap-and-thread-crash-hunting-in-mbed-os/#comment-304580)):

    ```
        void *ptr1 = malloc(512);
    1852:	f44f 7000 	mov.w	r0, #512	; 0x200
    1856:	f009 faeb 	bl	ae30 <malloc>
    185a:	9009      	str	r0, [sp, #36]	; 0x24
        void *ptr2 = calloc(768, 1);                <!--- this is where the dangling pointer was defined
    185c:	2101      	movs	r1, #1
    185e:	f44f 7040 	mov.w	r0, #768	; 0x300
    1862:	f008 fd7d 	bl	a360 <calloc>
    1866:	9008      	str	r0, [sp, #32]           <--- this line in ASM, look for the C++ line above to find the declaration
    ```

1. Look at the C++ line above the Assembly. This is the declaration of the dangling pointer.
