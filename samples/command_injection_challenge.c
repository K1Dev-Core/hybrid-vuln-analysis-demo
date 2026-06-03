#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void print_banner(void) {
    puts("== mini-shell challenge ==");
    puts("type a name to inspect");
}

static void setup_flag(void) {
    FILE *fp = fopen("flag.txt", "w");
    if (fp == NULL) {
        return;
    }
    fputs("flag{hybrid_pipeline_demo_success}\n", fp);
    fclose(fp);
}

int main(void) {
    char user_input[96];
    char command[160];

    setup_flag();
    print_banner();

    printf("name> ");
    fflush(stdout);

    if (fgets(user_input, sizeof(user_input), stdin) == NULL) {
        return 1;
    }

    user_input[strcspn(user_input, "\n")] = '\0';

    if (strlen(user_input) == 0) {
        puts("empty input");
        return 1;
    }

    if (strcmp(user_input, "admin") == 0) {
        puts("hello admin");
    }

    snprintf(command, sizeof(command), "echo hello %s", user_input);
    system(command);
    return 0;
}
