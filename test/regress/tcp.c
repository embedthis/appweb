/*  TCP test program */
#include <stdio.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#include <ctype.h>
#include <sys/time.h>
#include <fcntl.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stdlib.h>

int main(int argc, char **argv)
{
    int sockfd, portno, n;
    struct sockaddr_in serv_addr;
    struct hostent *server;
	FILE *initfile;
	char buffer[2048];
	int bytesread;
    struct stat filestatus;
	int index;
	int CRLFCRLF;

	if (argc < 4) {
		printf("usage: %s <ip_addr> <port> <filename>\n", argv[0]);

		return(-1);
	}

	if (stat(argv[3], &filestatus)) {
		printf("file %s not found\n", argv[3]);

		return(-1);
	}

    portno = atoi(argv[2]);
    sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd < 0) {
        printf("ERROR opening socket");
    }

    server = gethostbyname(argv[1]);
    if (server == NULL) {
        fprintf(stderr,"ERROR, no such host\n");
        exit(0);
    }

    bzero((char*) &serv_addr, sizeof(serv_addr));
    serv_addr.sin_family = AF_INET;
    bcopy((char*) server->h_addr, (char *)&serv_addr.sin_addr.s_addr, server->h_length);
    serv_addr.sin_port = htons(portno);

    if (connect(sockfd, (struct sockaddr *)&serv_addr,sizeof(serv_addr)) < 0) {
        printf("ERROR connecting");
    }

	initfile = fopen(argv[3], "rb");
	if (!initfile) {
		printf("ERROR opening %s\n", argv[3]);
		close(sockfd);
		exit(0);
	}

	/* send HTTP headers first */
	index = 0;
	CRLFCRLF = 0;
	while ((bytesread = fread(&buffer[index], 1, 1, initfile))>0) {
		if ((CRLFCRLF == 0 || CRLFCRLF == 2) && buffer[index] == '\r') {
			CRLFCRLF++;
		} else if ((CRLFCRLF == 1 || CRLFCRLF == 3) && buffer[index] == '\n') {
			CRLFCRLF++;
		} else {
			CRLFCRLF = 0;
		}
		index += bytesread;
		if (CRLFCRLF == 4)
			break;
	}
	send(sockfd, buffer, index, 0);

    /*
     *  Sleep to force a packet split between the write above and below 
     */
    sleep(1);

	/* send MIME headers */
	index = 0;
	CRLFCRLF = 0;
	while ((bytesread = fread(&buffer[index], 1, 1, initfile))>0) {
		if ((CRLFCRLF == 0 || CRLFCRLF == 2 || CRLFCRLF == 4) && buffer[index] == '\r') {
			CRLFCRLF++;
		} else if ((CRLFCRLF == 1 || CRLFCRLF == 3 || CRLFCRLF == 5) && buffer[index] == '\n') {
			CRLFCRLF++;
		} else {
			CRLFCRLF = 0;
		}
		index += bytesread;
		if (CRLFCRLF == 6)
			break;
	}
	send(sockfd, buffer, index, 0);

	/* send the rest */
	while ((bytesread = fread(buffer, 1, sizeof(buffer), initfile))>0) {
		send(sockfd, buffer, bytesread, 0);
	}
	fclose(initfile);

	while(1) {
		bytesread = recv(sockfd, buffer, sizeof(buffer), 0);
		if (bytesread <= 0) {
			break;
		}
	}
	close(sockfd);
	exit(0);
}

